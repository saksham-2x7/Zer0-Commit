import { describe, test, expect, beforeEach } from "vitest";
import {
  loadHealthProfile,
  saveHealthProfile,
  clearHealthProfile,
  loadPersonalDetails,
  savePersonalDetails,
  clearPersonalDetails,
} from "./healthProfile";

beforeEach(() => {
  window.localStorage.clear();
});

describe("healthProfile", () => {
  test("loads an empty profile when nothing is stored", () => {
    expect(loadHealthProfile()).toEqual([]);
  });

  test("returns [] for corrupted stored JSON", () => {
    window.localStorage.setItem("scamsahayak-health-profile", "{not json");
    expect(loadHealthProfile()).toEqual([]);
  });

  test("returns [] when stored data is not an array", () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify({ a: 1 }));
    expect(loadHealthProfile()).toEqual([]);
  });

  test("saveHealthProfile trims and drops empty tags, keeping distinct entries", () => {
    const saved = saveHealthProfile([" Diabetes ", "diabetes", "", "Peanut allergy"]);
    expect(saved).toEqual(["Diabetes", "diabetes", "Peanut allergy"]);
    expect(JSON.parse(window.localStorage.getItem("scamsahayak-health-profile"))).toEqual([
      "Diabetes",
      "diabetes",
      "Peanut allergy",
    ]);
  });

  test("clearHealthProfile removes the stored profile", () => {
    saveHealthProfile(["Diabetes"]);
    clearHealthProfile();
    expect(window.localStorage.getItem("scamsahayak-health-profile")).toBeNull();
    expect(loadHealthProfile()).toEqual([]);
  });
});

describe("healthProfile personal details", () => {
  test("loads null when nothing is stored and returns a saved record otherwise", () => {
    expect(loadPersonalDetails()).toBeNull();
    savePersonalDetails({ fullName: "Ramesh", contacts: [] });
    expect(loadPersonalDetails()).toEqual({ fullName: "Ramesh", contacts: [] });
  });

  test("survives corrupted stored JSON", () => {
    window.localStorage.setItem("scamsahayak-health-personal", "{not json");
    expect(loadPersonalDetails()).toBeNull();
  });

  test("clearPersonalDetails removes the stored record", () => {
    savePersonalDetails({ fullName: "Ramesh" });
    clearPersonalDetails();
    expect(window.localStorage.getItem("scamsahayak-health-personal")).toBeNull();
    expect(loadPersonalDetails()).toBeNull();
  });
});