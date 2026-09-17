import { useRef, useState } from "react";
import { t } from "../i18n/translations";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
// Keep in sync with the backend's default MAX_INPUT_BYTES (see CONTRACT.md).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
      onError?.(t(language, "errorCode_INPUT_TOO_LARGE"));
      return;
    }

    onError?.(null);
    const base64 = await fileToBase64(file);
    setPreviewUrl(URL.createObjectURL(file));
    onImageSelected(base64, file.type);
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
            alt="Selected screenshot preview"
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
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
