import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsView from "./SettingsView";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderView(overrides = {}) {
  return render(
    <SettingsView
      language="en"
      theme="light"
      onToggleTheme={vi.fn()}
      textSize="md"
      onCycleTextSize={vi.fn()}
      onLanguageChange={vi.fn()}
      {...overrides}
    />
  );
}

describe("SettingsView", () => {
  test("save button shows confirmation alert and sr-only status", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /save all changes/i }));
    expect(alertSpy).toHaveBeenCalledWith("Settings Saved Successfully");
    expect(screen.getByRole("status")).toHaveTextContent("Settings Saved Successfully");
  });

  test("theme buttons expose aria-pressed for the active theme", () => {
    renderView({ theme: "dark" });
    expect(screen.getByRole("button", { name: "Light Mode" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dark Mode" })).toHaveAttribute("aria-pressed", "true");
  });

  test("light/dark buttons request the opposite theme", () => {
    const onToggleTheme = vi.fn();
    renderView({ theme: "light", onToggleTheme });
    fireEvent.click(screen.getByRole("button", { name: "Dark Mode" }));
    expect(onToggleTheme).toHaveBeenCalled();
  });

  test("reset asks for confirmation before reloading", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(confirmSpy).toHaveBeenCalled();
  });
});