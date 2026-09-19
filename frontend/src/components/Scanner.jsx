import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { t, errorCodeMessage } from "../i18n/translations";
import { lookupProductByBarcode } from "../utils/productLookup";
import { loadHealthProfile } from "../utils/healthProfile";
import { getFoodFeedback } from "../services/api";

export default function Scanner({ language, onQrDecoded, onSetupHealthProfile }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const fileInputRef = useRef(null);

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [decoded, setDecoded] = useState(null); // { text, isQr }
  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [foodFeedback, setFoodFeedback] = useState(null);
  const [foodFeedbackLoading, setFoodFeedbackLoading] = useState(false);

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  async function handleDecoded(result) {
    controlsRef.current?.stop();
    setScanning(false);

    const text = result.getText();
    const isQr = result.getBarcodeFormat() === BarcodeFormat.QR_CODE;
    setDecoded({ text, isQr });

    if (!isQr) {
      setProductLoading(true);
      let info = null;
      try {
        info = await lookupProductByBarcode(text);
        // The product lookup leaves `name` null when the catalog match has no
        // name. The food-feedback API rejects that (400), so fall back to a
        // clear, localized label before it leaves this component.
        if (info && !info.name) {
          info = { ...info, name: t(language, "scanUnknownProductLabel") };
        }
        setProduct(info);
      } catch {
        setProduct(null);
      } finally {
        setProductLoading(false);
      }

      if (info) {
        const healthTags = loadHealthProfile();
        if (healthTags.length > 0) {
          setFoodFeedbackLoading(true);
          try {
            const { feedback } = await getFoodFeedback({ language, healthTags, product: info });
            setFoodFeedback(feedback);
          } catch (err) {
            const codeMessage = errorCodeMessage(language, err?.code);
            setFoodFeedback(codeMessage || t(language, "foodFeedbackErrorGeneric"));
          } finally {
            setFoodFeedbackLoading(false);
          }
        }
      }
    }
  }

  async function startCamera() {
    setError(null);
    setDecoded(null);
    setProduct(null);
    setFoodFeedback(null);
    setScanning(true);
    try {
      const controls = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) handleDecoded(result);
        }
      );
      controlsRef.current = controls;
    } catch {
      setScanning(false);
      setError(t(language, "scanCameraPermissionDenied"));
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    setScanning(false);
  }

  async function handleFileUpload(file) {
    if (!file) return;
    setError(null);
    setDecoded(null);
    setProduct(null);
    setFoodFeedback(null);
    const url = URL.createObjectURL(file);
    try {
      const result = await readerRef.current.decodeFromImageUrl(url);
      await handleDecoded(result);
    } catch {
      setError(t(language, "scanErrorGeneric"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function reset() {
    setDecoded(null);
    setProduct(null);
    setFoodFeedback(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600 dark:text-slate-300">{t(language, "scanIntro")}</p>

      {!decoded && (
        <div className="space-y-2">
          {scanning && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                muted
                playsInline
              />
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                {t(language, "scanScanningHint")}
              </p>
            </>
          )}
          <button
            type="button"
            className="btn-primary w-full"
            onClick={scanning ? stopCamera : startCamera}
          >
            {scanning ? t(language, "scanStopCameraButton") : t(language, "scanUseCameraButton")}
          </button>
          {!scanning && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              {t(language, "scanUploadImageButton")}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 p-3 font-semibold text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {decoded && decoded.isQr && (
        <div className="card space-y-3" aria-live="polite">
          <h3 className="text-lg font-semibold">{t(language, "scanQrFoundHeading")}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t(language, "scanQrFoundHint")}</p>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-mono text-sm dark:bg-slate-900">
            {decoded.text}
          </p>
          <button type="button" className="btn-primary w-full" onClick={() => onQrDecoded(decoded.text)}>
            {t(language, "scanCheckDecodedButton")}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={reset}>
            {t(language, "scanAgainButton")}
          </button>
        </div>
      )}

      {decoded && !decoded.isQr && (
        <div className="card space-y-3" aria-live="polite">
          <h3 className="text-lg font-semibold">{t(language, "scanBarcodeFoundHeading")}</h3>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">{decoded.text}</p>
          {productLoading ? (
            <p className="text-slate-500 dark:text-slate-400" role="status">
              {t(language, "scanProductLookingUp")}
            </p>
          ) : product ? (
            <div className="space-y-1">
              <h4 className="font-semibold">{t(language, "scanProductFoundHeading")}</h4>
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt={product.name || t(language, "scanProductAlt")}
                  className="h-24 w-24 object-contain"
                />
              )}
              <p>{product.name || "—"}</p>
              {product.brand && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>
              )}
              {product.nutriScore && (
                <p className="text-sm">
                  {t(language, "scanNutriScoreLabel")} {product.nutriScore}
                </p>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300">{t(language, "scanProductSource")}</p>

              <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                <h5 className="font-semibold text-slate-700 dark:text-slate-200">
                  {t(language, "foodFeedbackHeading")}
                </h5>
                {foodFeedbackLoading ? (
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {t(language, "foodFeedbackLoading")}
                  </p>
                ) : foodFeedback ? (
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{foodFeedback}</p>
                ) : (
                  <div className="mt-1">
                    <p className="text-slate-600 dark:text-slate-300">{t(language, "foodFeedbackNoProfile")}</p>
                    {onSetupHealthProfile && (
                      <button
                        type="button"
                        className="btn-secondary mt-2"
                        onClick={onSetupHealthProfile}
                      >
                        {t(language, "foodFeedbackSetupLink")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">{t(language, "scanProductNotFound")}</p>
          )}
          <button type="button" className="btn-secondary w-full" onClick={reset}>
            {t(language, "scanAgainButton")}
          </button>
        </div>
      )}
    </div>
  );
}
