import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HealthProfile from "./HealthProfile";

vi.mock("../services/api", () => ({
  ocrImage: vi.fn(),
  extractHealthTags: vi.fn(),
}));

import { ocrImage, extractHealthTags } from "../services/api";

function makeFile() {
  return new File([new Uint8Array(10)], "report.png", { type: "image/png" });
}

function getFileInput(container) {
  return container.querySelector('input[type="file"]');
}

beforeEach(() => {
  window.localStorage.clear();
  ocrImage.mockReset();
  extractHealthTags.mockReset();
});

describe("HealthProfile", () => {
  test("adding a tag manually saves it immediately, without any AI round trip", () => {
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. diabetes/i), {
      target: { value: "Peanut allergy" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText("Peanut allergy")).toBeInTheDocument();
    expect(ocrImage).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("scamsahayak-health-profile"))).toEqual([
      "Peanut allergy",
    ]);
  });

  test("suggested tags from a scanned document require explicit confirmation before saving", async () => {
    ocrImage.mockResolvedValue({ text: "Diagnosis: Type 2 Diabetes. No known allergies." });
    extractHealthTags.mockResolvedValue({ suggestedTags: ["Type 2 Diabetes"] });

    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText("Type 2 Diabetes");
    // Not saved yet — only suggested and pending review.
    expect(window.localStorage.getItem("scamsahayak-health-profile")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("scamsahayak-health-profile"))).toEqual([
        "Type 2 Diabetes",
      ])
    );
  });

  test("unchecking a suggested tag excludes it from what gets saved", async () => {
    ocrImage.mockResolvedValue({ text: "Diagnosis: Diabetes and hypertension" });
    extractHealthTags.mockResolvedValue({ suggestedTags: ["Diabetes", "Hypertension"] });

    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText("Hypertension");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // uncheck "Hypertension"
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("scamsahayak-health-profile"));
      expect(saved).toEqual(["Diabetes"]);
    });
  });

  test("shows an error and does not save anything when OCR finds no text", async () => {
    ocrImage.mockResolvedValue({ text: "" });

    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByRole("alert");
    expect(extractHealthTags).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("scamsahayak-health-profile")).toBeNull();
  });

  test("shows the specific message for a backend error code", async () => {
    ocrImage.mockRejectedValue(Object.assign(new Error("bad language"), { code: "UNSUPPORTED_LANGUAGE" }));

    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/language/i);
    expect(window.localStorage.getItem("scamsahayak-health-profile")).toBeNull();
  });

  test("shows a network message when the server cannot be reached", async () => {
    ocrImage.mockRejectedValue(new TypeError("Failed to fetch"));

    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/internet|connection/i);
  });

  test("removing a saved tag updates storage", () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify(["Diabetes", "Nut allergy"]));
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /remove diabetes/i }));

    expect(screen.queryByText("Diabetes")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("scamsahayak-health-profile"))).toEqual(["Nut allergy"]);
  });

  test("clearing the profile removes everything", () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify(["Diabetes"]));
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /clear health profile/i }));

    expect(screen.queryByText("Diabetes")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("scamsahayak-health-profile")).toBeNull();
  });
});
