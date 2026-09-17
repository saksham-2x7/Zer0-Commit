import { useRef, useState } from "react";
import { t } from "../i18n/translations";

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

export default function ImageUpload({ language, onImageSelected }) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    setPreviewUrl(URL.createObjectURL(file));
    onImageSelected(base64);
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
            className="max-h-64 w-full rounded-lg border border-slate-200 object-contain"
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
      <p className="mt-2 text-sm text-slate-500">{t(language, "imageUploadHint")}</p>
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
