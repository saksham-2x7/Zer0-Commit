import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LocationView from "./LocationView";

vi.mock("leaflet", () => {
  function freshLayer() {
    return { addTo: vi.fn(), bindPopup: vi.fn(), closePopup: vi.fn(), remove: vi.fn(), clearLayers: vi.fn() };
  }
  function freshMap() {
    return {
      setView: vi.fn(),
      fitBounds: vi.fn(),
      addLayer: vi.fn(() => freshLayer()),
      remove: vi.fn(),
      on: vi.fn(),
    };
  }
  const leaflet = {
    map: vi.fn(() => freshMap()),
    marker: vi.fn(() => freshLayer()),
    tileLayer: vi.fn(() => freshLayer()),
    layerGroup: vi.fn(() => freshLayer()),
    LayerGroup: vi.fn(() => freshLayer()),
    LatLng: vi.fn((lat, lng) => ({ lat, lng })),
    LatLngBounds: vi.fn(),
  };
  return { default: leaflet, ...leaflet };
});

vi.mock("../i18n/translations", () => ({
  t: (_lang, key) =>
    ({
      "locations.title": "Family locations",
      "locations.share": "Share my location",
      "locations.stop": "Stop sharing",
      "locations.lastSeen": "Last seen",
      "locations.noOneSharing": "No one is sharing their location",
      "locations.sharing": "You are sharing your location",
      "locations.permissionDenied": "Location access needed to share your live position",
    })[key] ?? key,
  errorCodeMessage: () => null,
}));

import L from "leaflet";

const LOCATIONS_FEED = {
  members: [
    { memberId: "mem_1", name: "Anjali", lat: 28.61, lng: 77.2, updatedAt: "2026-09-19T10:00:00.000Z" },
    { memberId: "mem_2", name: "Ravi", lat: 28.62, lng: 77.21, updatedAt: "2026-09-19T10:00:00.000Z" },
  ],
};

function mockFetchFeed(feed = LOCATIONS_FEED) {
  global.fetch = vi.fn(async (url, options) => {
    if (options?.method === "POST") {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => feed };
  });
}

function installGeolocation() {
  let watchSuccess = null;
  let watchError = null;
  const getCurrentPosition = vi.fn();
  const watchPosition = vi.fn((success, error) => {
    watchSuccess = success;
    watchError = error;
    return 41;
  });
  const clearWatch = vi.fn();
  Object.defineProperty(window.navigator, "geolocation", {
    value: { getCurrentPosition, watchPosition, clearWatch },
    configurable: true,
    writable: true,
  });
  return {
    getCurrentPosition,
    watchPosition,
    clearWatch,
    emitSuccess: ({ lat, lng, accuracy }) => {
      watchSuccess?.({ coords: { latitude: lat, longitude: lng, accuracy: accuracy ?? 12 } });
    },
    emitError: (err) => watchError?.(err),
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

const PROPS = { language: "en", familyId: "fam_1", memberId: "mem_1", memberName: "Anjali" };

beforeEach(() => {
  mockFetchFeed();
  installGeolocation();
  L.map.mockClear();
  L.marker.mockClear();
  L.tileLayer.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete window.navigator.geolocation;
});

describe("LocationView", () => {
  test("renders members from the locations GET and drops a map marker for each", async () => {
    render(<LocationView {...PROPS} />);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/location\/family\/fam_1$/),
      expect.anything()
    );

    expect(await screen.findByText("Anjali")).toBeInTheDocument();
    expect(screen.getByText("Ravi")).toBeInTheDocument();

    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.marker).toHaveBeenCalledTimes(2);
    const fitBounds = L.map.mock.results[0].value.fitBounds;
    expect(fitBounds).toHaveBeenCalled();
    const bounds = fitBounds.mock.calls[0][0];
    expect(bounds.length ?? 1).toBeGreaterThan(0);
  });

  test("shows a fallback message when no member is sharing a location", async () => {
    mockFetchFeed({ members: [] });
    render(<LocationView {...PROPS} />);

    expect(
      await screen.findByText("No one is sharing their location")
    ).toBeInTheDocument();
    expect(L.marker).not.toHaveBeenCalled();
  });

  test("share posts on the first fix and is throttled to one post per 30 seconds", async () => {
    vi.useFakeTimers();
    const geo = installGeolocation();
    render(<LocationView {...PROPS} />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);

    const shareCalls = () =>
      global.fetch.mock.calls.filter(([url]) => String(url).includes("/api/location/share"));

    await act(async () => geo.emitSuccess({ lat: 28.61, lng: 77.2 }));
    await flush();
    const firstCount = shareCalls().length;
    expect(firstCount).toBeGreaterThanOrEqual(1);
    const [, options] = shareCalls()[0];
    expect(JSON.parse(options.body)).toMatchObject({
      familyId: "fam_1",
      memberId: "mem_1",
      lat: 28.61,
      lng: 77.2,
    });

    await act(async () => geo.emitSuccess({ lat: 28.62, lng: 77.21 }));
    await flush();
    expect(shareCalls()).toHaveLength(firstCount);

    act(() => vi.advanceTimersByTime(30000));
    await act(async () => geo.emitSuccess({ lat: 28.63, lng: 77.22 }));
    await flush();
    expect(shareCalls()).toHaveLength(firstCount + 1);
  });

  test("stopping sharing clears the watch and posts the stop endpoint", async () => {
    const geo = installGeolocation();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    render(<LocationView {...PROPS} />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    await act(async () => geo.emitSuccess({ lat: 28.61, lng: 77.2 }));
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }));

    expect(geo.clearWatch).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    const stopCall = global.fetch.mock.calls.find(([url]) =>
      String(url).includes("/api/location/stop")
    );
    expect(stopCall).toBeTruthy();
    expect(JSON.parse(stopCall[1].body)).toMatchObject({
      familyId: "fam_1",
      memberId: "mem_1",
    });
  });

  test("unmounting while sharing posts stop and never posts again", async () => {
    vi.useFakeTimers();
    const geo = installGeolocation();
    const { unmount } = render(<LocationView {...PROPS} />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    await act(async () => geo.emitSuccess({ lat: 28.61, lng: 77.2 }));
    await flush();

    const stopCalls = () =>
      global.fetch.mock.calls.filter(([url]) => String(url).includes("/api/location/stop"));
    const shareCount = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/api/location/share")
    ).length;

    unmount();
    await flush();
    expect(stopCalls()).toHaveLength(1);
    expect(geo.clearWatch).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(120000));
    await flush();
    const shareAfter = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/api/location/share")
    ).length;
    expect(shareAfter).toBe(shareCount);
    expect(stopCalls()).toHaveLength(1);
  });

  test("shows the permission-denied message when geolocation fails and posts no share", async () => {
    const geo = installGeolocation();
    render(<LocationView {...PROPS} />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    await act(async () => geo.emitError({ code: 1, message: "Permission denied" }));
    await flush();

    expect(
      screen.getByText("Location access needed to share your live position")
    ).toBeInTheDocument();
    const shareCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/api/location/share")
    );
    expect(shareCalls).toHaveLength(0);
  });
});