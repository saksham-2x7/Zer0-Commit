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

  test("shows an error and does not start OCR for a file larger than 4 MiB", () => {
    const bigFile = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "huge.png",
      { type: "image/png" }
    );
    const { container } = render(<HealthProfile language="en" onBack={vi.fn()} />);
    fireEvent.change(getFileInput(container), { target: { files: [bigFile] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/4 MB/i);
    expect(ocrImage).not.toHaveBeenCalled();
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

describe("HealthProfile — personal details & contacts", () => {
  test("saves personal details on-device and confirms", () => {
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Geeta Kumari" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    const stored = JSON.parse(window.localStorage.getItem("scamsahayak-health-personal"));
    expect(stored.fullName).toBe("Geeta Kumari");
    expect(screen.getByRole("status")).toHaveTextContent(/device only/i);
  });

  test("restores previously saved personal details", () => {
    window.localStorage.setItem(
      "scamsahayak-health-personal",
      JSON.stringify({ fullName: "Geeta Kumari", phone: "+91 1", age: "60", household: "Parent" })
    );
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    expect(screen.getByLabelText("Full Name")).toHaveValue("Geeta Kumari");
  });

  test("rejects an overlong detail with a friendly alert and saves nothing", () => {
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Age"), { target: { value: "1".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/too long/i);
    expect(window.localStorage.getItem("scamsahayak-health-personal")).toBeNull();
  });

  test("unblocking a number flips its button to Unblocked", () => {
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^unblock$/i })[0]);

    expect(screen.getByRole("button", { name: /^unblocked$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^unblock$/i })).toHaveLength(1);
  });

  test("adds a family contact and persists it in the personal record", () => {
    render(<HealthProfile language="en" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /add another family member/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Rohan Mehta" } });
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: "+91 90000 11111" } });
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));

    expect(screen.getByText("Rohan Mehta")).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem("scamsahayak-health-personal"));
    expect(stored.contacts).toEqual([{ name: "Rohan Mehta", phone: "+91 90000 11111" }]);
  });
});
