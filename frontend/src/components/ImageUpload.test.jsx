import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageUpload from "./ImageUpload";

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

  test("rejects a file over the 5 MB limit before reading it", async () => {
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
});
