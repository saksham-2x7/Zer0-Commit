import { useRef, useState } from "react";
import { t } from "../i18n/translations";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
// Keep in sync with the backend's default MAX_INPUT_BYTES (see CONTRACT.md).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Anything over ~1 MB gets freed from the mobile wire: the full-resolution
// bytes are decoded on a <canvas> and re-encoded down (longest edge ~1600px,
// JPEG q0.8). PNG stays PNG so screenshots keep their text sharp for OCR —
// we only downscale, never recompress PNG lossily.
export const DOWNSCALE_MIN_BYTES = 1024 * 1024;
export const DOWNSCALE_MAX_EDGE = 1600;

export function shouldDownscale(file) {
  return Boolean(file && file.size > DOWNSCALE_MIN_BYTES);
}

/** Downscale a decoded image to an edge-capped Blob, preserving its format. */
export function downscaleImageToBlob(blob, maxEdge = DOWNSCALE_MAX_EDGE) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxEdge && height <= maxEdge) {
        resolve(blob);
        return;
      }
      const scale = maxEdge / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const isPng = blob.type === "image/png";
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error("canvas toBlob failed"))),
        isPng ? "image/png" : "image/jpeg",
        isPng ? undefined : 0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not decode image"));
    };
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      // Strip the "data:image/png;base64," prefix — contract wants raw base64.
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageUpload({ language, onImageSelected, onError }) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  async function handleFile(file) {
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      onError?.(t(language, "errorCode_INVALID_IMAGE"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onError?.(`${t(language, "errorCode_INPUT_TOO_LARGE")} ${t(language, "imageUploadSizeHint")}`);
      return;
    }

    onError?.(null);

    let outputFile = file;
    // jsdom (and some headless browsers) don't implement <canvas>, so the
    // re-encode can never succeed there — skip straight to the original.
    const canvas = document.createElement("canvas");
    const canvasSupported = typeof canvas.getContext === "function" && !!canvas.getContext("2d");
    if (canvasSupported && shouldDownscale(file)) {
      try {
        const resized = await downscaleImageToBlob(file);
        if (resized !== file) {
          outputFile = new File([resized], file.name, { type: resized.type });
        }
      } catch {
        // Canvas decode/encode failed — send the original.
      }
    }

    const base64 = await fileToBase64(outputFile);
    setPreviewUrl(URL.createObjectURL(outputFile));
    onImageSelected(base64, outputFile.type);
  }

  return (
    <div>
      {!previewUrl ? (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => inputRef.current?.click()}
        >
          {t(language, "imageUploadPrompt")}
        </button>
      ) : (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt={t(language, "imagePreviewAlt")}
            className="max-h-64 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700"
          />
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => inputRef.current?.click()}
          >
            {t(language, "imageChangeButton")}
          </button>
        </div>
      )}
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(language, "imageUploadHint")}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}