import { useEffect, useState } from "react";

const STORAGE_KEY = "scamsahayak-text-size";
const SIZES = ["normal", "large", "xlarge"];
const ROOT_FONT_SIZE = { normal: "18px", large: "22px", xlarge: "27px" };

function getInitialSize() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (SIZES.includes(stored)) return stored;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return "normal";
}

/** Manages the elder-friendly text-size control: persists choice, sets the root font size. */
export function useTextSize() {
  const [textSize, setTextSize] = useState(getInitialSize);

  useEffect(() => {
    document.documentElement.style.fontSize = ROOT_FONT_SIZE[textSize];
    try {
      window.localStorage.setItem(STORAGE_KEY, textSize);
    } catch {
      // Ignore — size still applies for this session, just won't persist.
    }
  }, [textSize]);

  function cycleTextSize() {
    setTextSize((current) => SIZES[(SIZES.indexOf(current) + 1) % SIZES.length]);
  }

  return { textSize, cycleTextSize };
}
