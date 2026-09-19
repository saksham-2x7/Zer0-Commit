import { lazy, Suspense, useState } from "react";
import { t, errorCodeMessage } from "../i18n/translations";
import { foodLookup } from "../services/api";

const FAMILY_ID_KEY = "scamsahayak-family-id";

const Scanner = lazy(() => import("./Scanner"));

function readFamilyId() {
  try {
    return window.localStorage.getItem(FAMILY_ID_KEY) || "";
  } catch {
    return "";
  }
}

export default function FoodScanView({ language, onNavigate }) {
  const familyId = readFamilyId();
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState(null);
  const [memberFlags, setMemberFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLookup(e) {
    if (e) e.preventDefault();
    if (!barcode.trim()) {
      setError(t(language, "food.needBarcode"));
      return;
    }
    setLoading(true);
    setError(null);
    setProduct(null);
    setMemberFlags([]);
    try {
      const data = await foodLookup({ barcode: barcode.trim(), familyId });
      setProduct(data.product);
      setMemberFlags(data.memberFlags || []);
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (!familyId) {
    return (
      <section aria-labelledby="food-no-family-title">
        <h2 id="food-no-family-title" className="text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
          {t(language, "food.noFamilyTitle")}
        </h2>
        <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed">{t(language, "food.noFamilyBody")}</p>
        <button
          type="button"
          className="btn-primary touch-target mt-8 h-16 px-10"
          onClick={() => onNavigate("family")}
        >
          {t(language, "food.createFamilyButton")}
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="food-title">
      <h2 id="food-title" className="text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
        {t(language, "food.title")}
      </h2>
      <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed">{t(language, "food.subtitle")}</p>

      <form onSubmit={handleLookup} className="mt-10 flex flex-col gap-4 md:flex-row">
        <label htmlFor="food-barcode" className="sr-only">
          {t(language, "food.barcodeLabel")}
        </label>
        <input
          id="food-barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder={t(language, "food.barcodePlaceholder")}
          inputMode="numeric"
          maxLength={14}
          className="field flex-1 text-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:cursor-not-allowed h-16 px-10"
        >
          {loading ? t(language, "food.lookingUp") : t(language, "food.lookupButton")}
        </button>
      </form>

      <div className="mt-6">
        <Suspense fallback={<p className="font-bold">{t(language, "loadingScanner")}</p>}>
          <Scanner
            language={language}
            onQrDecoded={(text) => {
              setBarcode(text.trim());
              setError(null);
            }}
            onSetupHealthProfile={() => onNavigate("health")}
          />
        </Suspense>
      </div>

      {error && (
        <p role="alert" className="mt-6 alert-red p-3 font-semibold">
          {error}
        </p>
      )}

      {memberFlags.length > 0 && (
        <div role="alert" className="mt-8 alert-red p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em]">
            {t(language, "food.flagTitle")}
          </h3>
          <ul className="mt-4 space-y-3">
            {memberFlags.map((flag) => (
              <li key={flag.memberId} className="font-bold">
                {flag.name}: {flag.matched.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {product && (
        <article className="mt-8 border border-ink bg-soft p-6">
          <div className="flex flex-wrap items-start gap-6">
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt=""
                className="h-40 w-40 border border-ink bg-paper object-contain"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-3xl font-black tracking-tight">{product.name || t(language, "food.unknownProduct")}</h3>
              {product.brand && <p className="mt-2 text-lg font-bold opacity-70">{product.brand}</p>}
              {product.ingredientsText && (
                <p className="mt-4 font-semibold leading-relaxed opacity-80">{product.ingredientsText}</p>
              )}
            </div>
          </div>
          {(product.allergens.length > 0 || product.traces.length > 0 || product.additives.length > 0) && (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {product.allergens.length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">{t(language, "food.allergens")}</h4>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {product.allergens.map((a) => (
                      <li key={a} className="chip">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {product.traces.length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">{t(language, "food.traces")}</h4>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {product.traces.map((a) => (
                      <li key={a} className="chip">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {product.additives.length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">{t(language, "food.additives")}</h4>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {product.additives.map((a) => (
                      <li key={a} className="chip">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      )}
    </section>
  );
}