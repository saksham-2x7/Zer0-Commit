import { useEffect, useState } from "react";

const STORAGE_KEY = "scamsahayak-theme";

function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to the dark default.
  }
  // Dark is the default experience; users who prefer light opt out via the toggle.
  return "dark";
}

/** Manages the light/dark theme: persists choice, applies the `dark` class to <html>. */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore — theme still applies for this session, just won't persist.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
