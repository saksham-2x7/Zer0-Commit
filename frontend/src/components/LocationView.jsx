import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n/translations";
import { shareLocation, stopLocation, getFamilyLocations, isDemoMode } from "../services/api";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon points at relative asset paths that break
// under Vite — pin them to the CDN copy of the same files. Guarded so the
// component still imports cleanly under test (where leaflet is mocked).
if (L.Icon?.Default) {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

const FAMILY_ID_KEY = "scamsahayak-family-id";
const MEMBER_ID_KEY = "scamsahayak-member-id";
const MEMBER_NAME_KEY = "scamsahayak-member-name";

const SHARE_THROTTLE_MS = 30000; // at most one position POST per 30s
const POLL_MS = 25000; // refresh the family feed every 25s while sharing

// Demo family members (around Delhi) shown when the location API is
// unreachable or no family has been set up yet — the map still works.
function demoMembers() {
  const now = new Date().toISOString();
  return [
    { memberId: "demo-1", name: "Aarav", lat: 28.6139, lng: 77.209, updatedAt: now },
    { memberId: "demo-2", name: "Meera", lat: 28.63, lng: 77.22, updatedAt: now },
    { memberId: "demo-3", name: "Rohan", lat: 28.6, lng: 77.19, updatedAt: now },
  ];
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function readStored(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function minutesSince(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  return minutes < 1 ? "1" : String(minutes);
}

export default function LocationView({ language, familyId, memberId, memberName }) {
  const famId = familyId || readStored(FAMILY_ID_KEY);
  const memId = memberId || readStored(MEMBER_ID_KEY);
  const memName = memberName || readStored(MEMBER_NAME_KEY);

  // Without a family, or when the API is unreachable, we render the map with
  // demo members instead of blocking — the feature stays visible offline.
  const [demoMode, setDemoMode] = useState(() => !famId);
  const [members, setMembers] = useState(() => (famId ? [] : demoMembers()));
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const watchIdRef = useRef(null);
  const pollRef = useRef(null);
  const demoIntervalRef = useRef(null);
  const lastPostRef = useRef(0);
  const sharingRef = useRef(false);
  const demoRef = useRef(demoMode);

  useEffect(() => {
    demoRef.current = demoMode;
  }, [demoMode]);

  const enterDemo = useCallback(() => {
    setDemoMode(true);
    setMembers(demoMembers());
  }, []);

  const refresh = useCallback(async () => {
    if (!famId) return;
    try {
      const data = await getFamilyLocations(famId);
      // api.js already fell back to demo data (and flipped its own flag) —
      // use OUR demo members + banner instead of the api-level demo feed.
      if (isDemoMode()) {
        enterDemo();
        return;
      }
      setMembers(Array.isArray(data?.members) ? data.members : []);
      setDemoMode(false);
    } catch {
      enterDemo();
    }
  }, [famId, enterDemo]);

  // Create the map once, then load the family feed (or demo members).
  useEffect(() => {
    if (mapElRef.current && !mapRef.current) {
      const map = L.map(mapElRef.current);
      map.setView([20.5937, 78.9629], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const layer = L.layerGroup();
      layer.addTo(map);
      markersRef.current = layer;
      mapRef.current = map;
    }
    if (famId) refresh();
    return () => {
      // Leaving the screen while sharing must stop the live feed (in demo
      // mode that means the local simulation — never a network call).
      if (sharingRef.current) {
        sharingRef.current = false;
        if (demoRef.current) {
          if (demoIntervalRef.current !== null) {
            window.clearInterval(demoIntervalRef.current);
            demoIntervalRef.current = null;
          }
        } else {
          if (watchIdRef.current !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          if (memId) stopLocation({ familyId: famId, memberId: memId }).catch(() => {});
        }
      }
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [famId]);

  // Keep the map markers in sync with the feed.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (members.length === 0) return;
    members.forEach((m) => {
      if (typeof m.lat !== "number" || typeof m.lng !== "number") return;
      const label = `${m.name} — ${t(language, "locations.lastSeen").replace("{m}", minutesSince(m.updatedAt))}`;
      const marker = L.marker([m.lat, m.lng]);
      marker.addTo(layer);
      marker.bindPopup(label);
    });
    map.fitBounds(members.filter((m) => typeof m.lat === "number" && typeof m.lng === "number").map((m) => [m.lat, m.lng]));
  }, [members, language]);

  function postPosition(position) {
    const now = Date.now();
    if (now - lastPostRef.current < SHARE_THROTTLE_MS) return;
    lastPostRef.current = now;
    shareLocation({
      familyId: famId,
      memberId: memId,
      name: memName,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }).catch(() => {});
  }

  function handleShare() {
    if (demoRef.current) {
      // Demo mode: simulate a live feed locally — no geolocation, no network.
      setPermissionDenied(false);
      sharingRef.current = true;
      setSharing(true);
      demoIntervalRef.current = window.setInterval(() => {
        setMembers((current) => {
          if (current.length === 0) return current;
          const now = new Date().toISOString();
          return current.map((m) => ({
            ...m,
            lat: round6(m.lat + (Math.random() - 0.5) * 0.01),
            lng: round6(m.lng + (Math.random() - 0.5) * 0.01),
            updatedAt: now,
          }));
        });
      }, POLL_MS);
      return;
    }
    if (!navigator.geolocation) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        sharingRef.current = true;
        setSharing(true);
        postPosition(position);
      },
      () => {
        setPermissionDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    pollRef.current = window.setInterval(() => {
      refresh();
    }, POLL_MS);
  }

  function handleStop() {
    sharingRef.current = false;
    setSharing(false);
    if (demoRef.current) {
      if (demoIntervalRef.current !== null) {
        window.clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      return;
    }
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (memId) stopLocation({ familyId: famId, memberId: memId }).catch(() => {});
  }

  return (
    <section aria-labelledby="locations-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="locations-title" className="text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-5xl">
            {t(language, "locations.title")}
          </h2>
          {famId && (
            <p className="mt-4 text-lg font-bold opacity-70">{t(language, "family.familyIdLabel")} {famId}</p>
          )}
        </div>
        {sharing ? (
          <button
            type="button"
            className="btn-secondary touch-target inline-flex gap-2 px-6 text-sm"
            onClick={handleStop}
          >
            {t(language, "locations.stop")}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary touch-target inline-flex gap-2 px-6 text-sm"
            onClick={handleShare}
          >
            {t(language, "locations.share")}
          </button>
        )}
      </div>

      {demoMode && (
        <p role="alert" className="mt-6 alert-red p-3 font-semibold">
          {t(language, "common.apiFallback")}
        </p>
      )}
      {permissionDenied && (
        <p role="alert" className="mt-6 alert-red p-3 font-semibold">
          {t(language, "locations.permissionDenied")}
        </p>
      )}
      {sharing && (
        <p role="status" className="mt-6 font-bold text-[var(--color-accent-family)]">
          {t(language, "locations.sharing")}
        </p>
      )}

      <div className="mt-8 space-y-6">
        <div ref={mapElRef} className="location-map" aria-label={t(language, "locations.title")} />

        {members.length === 0 ? (
          <p className="font-bold opacity-70">{t(language, "locations.noOneSharing")}</p>
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.memberId} className="flex flex-wrap items-center justify-between gap-2 border border-ink bg-soft p-4">
                <span className="text-lg font-black">{m.name}</span>
                <span className="text-xs font-bold uppercase tracking-widest opacity-60">
                  {t(language, "locations.lastSeen").replace("{m}", minutesSince(m.updatedAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}