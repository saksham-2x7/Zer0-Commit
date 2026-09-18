import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";
import { useLanguage } from "./useLanguage";
import { useTextSize } from "./useTextSize";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("style");
  document.documentElement.lang = "";
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  test("defaults to light and toggles to dark, persisting both", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(window.localStorage.getItem("scamsahayak-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("reads a stored dark preference and toggles back to light", () => {
    window.localStorage.setItem("scamsahayak-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(window.localStorage.getItem("scamsahayak-theme")).toBe("light");
  });

  test("falls back to the OS dark preference when nothing is stored, and ignores an invalid stored value", () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-color-scheme: dark"),
    }));
    const darkHook = renderHook(() => useTheme());
    expect(darkHook.result.current.theme).toBe("dark");

    window.localStorage.setItem("scamsahayak-theme", "hotdog");
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
    const lightHook = renderHook(() => useTheme());
    expect(lightHook.result.current.theme).toBe("light");
  });

  test("survives localStorage being unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe("light");
      act(() => result.current.toggleTheme());
      expect(result.current.theme).toBe("dark");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("useLanguage", () => {
  test("defaults to en and applies it to <html lang> and <title>", () => {
    renderHook(() => useLanguage());
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toContain("ScamSahayak");
  });

  test("restores a persisted supported language and ignores an invalid stored value", () => {
    window.localStorage.setItem("scamsahayak-language", "hi");
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe("hi");

    window.localStorage.setItem("scamsahayak-language", "xx");
    const fallback = renderHook(() => useLanguage());
    expect(fallback.result.current.language).toBe("en");
  });

  test("persists the selected language and survives a storage write failure", () => {
    const { result } = renderHook(() => useLanguage());
    act(() => result.current.setLanguage("mr"));
    expect(window.localStorage.getItem("scamsahayak-language")).toBe("mr");
    expect(document.documentElement.lang).toBe("mr");

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const failing = renderHook(() => useLanguage());
    act(() => failing.result.current.setLanguage("ta"));
    expect(failing.result.current.language).toBe("ta");
    spy.mockRestore();
  });
});

describe("useTextSize", () => {
  test("defaults to normal and cycles through all three sizes", () => {
    const { result } = renderHook(() => useTextSize());
    expect(result.current.textSize).toBe("normal");

    act(() => result.current.cycleTextSize());
    expect(result.current.textSize).toBe("large");

    act(() => result.current.cycleTextSize());
    expect(result.current.textSize).toBe("xlarge");

    act(() => result.current.cycleTextSize());
    expect(result.current.textSize).toBe("normal");
  });

  test("restores a persisted size and applies the root font size", () => {
    window.localStorage.setItem("scamsahayak-text-size", "xlarge");
    const { result } = renderHook(() => useTextSize());
    expect(result.current.textSize).toBe("xlarge");
    expect(document.documentElement.style.fontSize).toBe("27px");
  });

  test("ignores an invalid stored size and survives a storage write failure", () => {
    window.localStorage.setItem("scamsahayak-text-size", "huge");
    const { result } = renderHook(() => useTextSize());
    expect(result.current.textSize).toBe("normal");

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    act(() => result.current.cycleTextSize());
    expect(result.current.textSize).toBe("large");
    spy.mockRestore();
  });
});