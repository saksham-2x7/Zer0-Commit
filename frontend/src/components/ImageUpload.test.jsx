import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageUpload, { shouldDownscale, downscaleImageToBlob, DOWNSCALE_MIN_BYTES } from "./ImageUpload";

function makeFile({ name = "screenshot.png", type = "image/png", sizeBytes = 1024 }) {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

function getFileInput(container) {
  return container.querySelector('input[type="file"]');
}

describe("ImageUpload", () => {
  test("accepts a valid small PNG and calls onImageSelected", async () => {
    const onImageSelected = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <ImageUpload language="en" onImageSelected={onImageSelected} onError={onError} />
    );

    const file = makeFile({ sizeBytes: 1024 });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await vi.waitFor(() => expect(onImageSelected).toHaveBeenCalled());
    expect(onImageSelected.mock.calls[0][1]).toBe("image/png");
    expect(onError).toHaveBeenCalledWith(null);
  });

  test("rejects an unsupported file type before reading it", async () => {
    const onImageSelected = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <ImageUpload language="en" onImageSelected={onImageSelected} onError={onError} />
    );

    const file = makeFile({ name: "not-an-image.gif", type: "image/gif" });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/valid jpg or png/i));
    expect(onImageSelected).not.toHaveBeenCalled();
  });

  test("rejects a file over the 4 MB limit before reading it", async () => {
    const onImageSelected = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <ImageUpload language="en" onImageSelected={onImageSelected} onError={onError} />
    );

    const file = makeFile({ sizeBytes: 6 * 1024 * 1024 });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
    expect(onImageSelected).not.toHaveBeenCalled();
  });

  test("does not downscale files at or under the threshold", () => {
    expect(shouldDownscale(makeFile({ sizeBytes: 1024 }))).toBe(false);
    expect(shouldDownscale(makeFile({ sizeBytes: DOWNSCALE_MIN_BYTES }))).toBe(false);
  });

  test("downscales files over the 1 MB threshold", () => {
    expect(shouldDownscale(makeFile({ sizeBytes: DOWNSCALE_MIN_BYTES + 1 }))).toBe(true);
  });

  test("accepts a large-but-under-limit PNG even without canvas (fallback keeps original)", async () => {
    const onImageSelected = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <ImageUpload language="en" onImageSelected={onImageSelected} onError={onError} />
    );

    const file = makeFile({ sizeBytes: 3 * 1024 * 1024 });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await vi.waitFor(() => expect(onImageSelected).toHaveBeenCalled());
    expect(onImageSelected.mock.calls[0][1]).toBe("image/png");
  });

  test("shows a preview and a change button after a successful selection", async () => {
    const onImageSelected = vi.fn();
    const { container } = render(
      <ImageUpload language="en" onImageSelected={onImageSelected} onError={vi.fn()} />
    );

    const file = makeFile({ sizeBytes: 1024 });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await vi.waitFor(() => expect(onImageSelected).toHaveBeenCalled());
    expect(screen.getByRole("img")).toHaveAttribute("alt", expect.stringMatching(/preview/i));
    expect(screen.getByRole("button", { name: /choose a different screenshot/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /choose a different screenshot/i }));
    expect(getFileInput(container)).not.toBeNull();
  });
});

describe("downscaleImageToBlob", () => {
  function stubImage() {
    let current = null;
    function FakeImage() {
      this.width = 0;
      this.height = 0;
      current = this;
    }
    Object.defineProperty(FakeImage.prototype, "src", {
      set(value) {
        this._src = value;
      },
    });
    window.Image = FakeImage;
    return {
      getCurrent: () => current,
      set: (width, height) => {
        current.width = width;
        current.height = height;
      },
      load: () => current.onload(),
      fail: () => current.onerror(),
    };
  }

  function fakeCanvas({ withContext = true, blobOut = new Blob(["x"]) } = {}) {
    const toBlob = vi.fn((cb) => cb(blobOut));
    const ctx = withContext ? { drawImage: vi.fn() } : null;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob,
    };
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas" ? canvas : document.createElement.call(document, tag)
    );
    return { canvas, toBlob, createElement };
  }

  test("resolves with the original blob when the image is already within the max edge", async () => {
    const img = stubImage();
    const blob = new Blob(["png"], { type: "image/png" });

    const promise = downscaleImageToBlob(blob);
    img.set(800, 500);
    img.load();

    await expect(promise).resolves.toBe(blob);
  });

  test("downscales an oversized PNG and re-encodes as PNG without a quality hint", async () => {
    const img = stubImage();
    const { canvas, toBlob, createElement } = fakeCanvas();
    const blob = new Blob(["png"], { type: "image/png" });

    const promise = downscaleImageToBlob(blob, 1600);
    img.set(3200, 2000);
    img.load();

    await expect(promise).resolves.not.toBe(blob);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", undefined);
    expect(createElement).toHaveBeenCalled();
  });

  test("re-encodes an oversized JPEG with a quality hint", async () => {
    const img = stubImage();
    const { toBlob } = fakeCanvas();
    const blob = new Blob(["jpg"]);

    const promise = downscaleImageToBlob(blob, 1600);
    img.set(1601, 1601);
    img.load();

    await expect(promise).resolves.not.toBe(blob);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
  });

  test("rejects when the 2d canvas context is unavailable", async () => {
    const img = stubImage();
    fakeCanvas({ withContext: false });
    const blob = new Blob(["png"], { type: "image/png" });

    const promise = downscaleImageToBlob(blob, 1600);
    img.set(3200, 2000);
    img.load();

    await expect(promise).rejects.toThrow(/canvas context unavailable/i);
  });

  test("rejects and revokes the object URL when the image fails to decode", async () => {
    const img = stubImage();
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const blob = new Blob(["png"], { type: "image/png" });

    const promise = downscaleImageToBlob(blob, 1600);
    img.fail();

    await expect(promise).rejects.toThrow(/could not decode image/i);
    expect(revoke).toHaveBeenCalled();
  });
});
