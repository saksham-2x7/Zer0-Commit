import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FamilyView from "./FamilyView";

vi.mock("../services/api", () => ({
  createFamily: vi.fn(),
  getFamily: vi.fn(),
  addFamilyMember: vi.fn(),
  addFamilyContact: vi.fn(),
  addFamilyAlert: vi.fn(),
  confirmFamilyAlert: vi.fn(),
  addFamilyBlocklist: vi.fn(),
}));

import {
  createFamily,
  getFamily,
  addFamilyMember,
  addFamilyContact,
  addFamilyAlert,
  confirmFamilyAlert,
} from "../services/api";

const FAMILY = {
  name: "Sharma Family",
  members: [
    { memberId: "mem_1", name: "Anjali", role: "admin", allergies: [] },
    { memberId: "mem_2", name: "Ravi", role: "elder", allergies: ["peanut"] },
  ],
  contacts: [
    {
      contactId: "con_1",
      name: "Unknown caller",
      phone: "+91 98765 43210",
      note: "Wanted my OTP",
      flaggedBy: "mem_1",
      status: "flagged",
    },
  ],
  alerts: [
    {
      alertId: "alt_1",
      title: "OTP scam going around",
      detail: "Fake bank calls",
      riskLevel: "high",
      confirmedBy: [],
    },
  ],
  // Required by the current (pre-removal) FamilyView blocklist section; it
  // becomes dead fixture data once that section is deleted.
  blocklist: [],
};

function seedFamily() {
  window.localStorage.setItem("scamsahayak-family-id", "fam_1");
  window.localStorage.setItem("scamsahayak-member-id", "mem_1");
  window.localStorage.setItem("scamsahayak-member-name", "Anjali");
}

beforeEach(() => {
  window.localStorage.clear();
  createFamily.mockReset();
  getFamily.mockReset();
  addFamilyMember.mockReset();
  addFamilyContact.mockReset();
  addFamilyAlert.mockReset();
  confirmFamilyAlert.mockReset();
  getFamily.mockResolvedValue({ family: FAMILY });
});

describe("FamilyView", () => {
  test("shows the create-family form when no family exists on this device", () => {
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /start your family circle/i })
    ).toBeInTheDocument();
    expect(getFamily).not.toHaveBeenCalled();
  });

  test("creating a family stores the ids and renders the circle", async () => {
    createFamily.mockResolvedValue({ familyId: "fam_1", family: FAMILY });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Family name"), {
      target: { value: "Sharma Family" },
    });
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Anjali" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create family circle/i }));

    expect(createFamily).toHaveBeenCalledWith({
      name: "Sharma Family",
      adminName: "Anjali",
    });
    await screen.findByText("Sharma Family");
    expect(window.localStorage.getItem("scamsahayak-family-id")).toBe("fam_1");
    expect(window.localStorage.getItem("scamsahayak-member-id")).toBe("mem_1");
    expect(window.localStorage.getItem("scamsahayak-member-name")).toBe("Anjali");
    expect(screen.getByText("Anjali")).toBeInTheDocument();
  });

  test("loads an existing family and renders members, contacts, and alerts", async () => {
    seedFamily();
    render(<FamilyView language="en" onNavigate={vi.fn()} />);

    await screen.findByText("Sharma Family");
    expect(getFamily).toHaveBeenCalledWith("fam_1");
    expect(screen.getByText("Anjali")).toBeInTheDocument();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    expect(screen.getByText("peanut")).toBeInTheDocument();
    expect(screen.getByText("Unknown caller")).toBeInTheDocument();
    expect(screen.getByText("+91 98765 43210")).toBeInTheDocument();
    expect(screen.getByText("OTP scam going around")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /i got this too/i })
    ).toBeInTheDocument();
  });

  test("adds a member with parsed allergy tags", async () => {
    seedFamily();
    addFamilyMember.mockResolvedValue({ member: {} });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Geeta" } });
    fireEvent.change(screen.getByLabelText(/allergies/i), {
      target: { value: "milk,  fish" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() =>
      expect(addFamilyMember).toHaveBeenCalledWith({
        familyId: "fam_1",
        name: "Geeta",
        role: "member",
        allergies: ["milk", "fish"],
      })
    );
  });

  test("flags a suspicious contact", async () => {
    seedFamily();
    addFamilyContact.mockResolvedValue({ contact: {} });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    fireEvent.change(screen.getByLabelText("Contact name"), {
      target: { value: "Deepak" },
    });
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+91 90000 11111" },
    });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Asked for OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /flag contact/i }));

    await waitFor(() =>
      expect(addFamilyContact).toHaveBeenCalledWith({
        familyId: "fam_1",
        name: "Deepak",
        phone: "+91 90000 11111",
        note: "Asked for OTP",
        flaggedBy: "mem_1",
      })
    );
  });

  test("posts a scam alert", async () => {
    seedFamily();
    addFamilyAlert.mockResolvedValue({ alert: {} });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    fireEvent.change(screen.getByLabelText("Alert title"), {
      target: { value: "Fake electricity bill" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post alert/i }));

    await waitFor(() =>
      expect(addFamilyAlert).toHaveBeenCalledWith({
        familyId: "fam_1",
        title: "Fake electricity bill",
        detail: "",
        riskLevel: "medium",
      })
    );
  });

  test("confirming an alert calls confirmFamilyAlert with the member id", async () => {
    seedFamily();
    confirmFamilyAlert.mockResolvedValue({ alert: {} });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    fireEvent.click(screen.getByRole("button", { name: /i got this too/i }));

    await waitFor(() =>
      expect(confirmFamilyAlert).toHaveBeenCalledWith({
        familyId: "fam_1",
        alertId: "alt_1",
        memberId: "mem_1",
      })
    );
  });

  test("hides the confirm button once the member already confirmed the alert", async () => {
    seedFamily();
    getFamily.mockResolvedValue({
      family: {
        ...FAMILY,
        alerts: [
          {
            alertId: "alt_1",
            title: "OTP scam going around",
            detail: "",
            riskLevel: "high",
            confirmedBy: ["mem_1"],
          },
        ],
      },
    });
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    expect(
      screen.queryByRole("button", { name: /i got this too/i })
    ).not.toBeInTheDocument();
  });

  test("shows an error state when the family cannot be loaded", async () => {
    seedFamily();
    getFamily.mockRejectedValue(new Error("Family not found."));
    render(<FamilyView language="en" onNavigate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  test("does not render the removed blocklist section", async () => {
    seedFamily();
    render(<FamilyView language="en" onNavigate={vi.fn()} />);
    await screen.findByText("Sharma Family");

    expect(screen.queryByText("Blocklist")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add to blocklist/i })
    ).not.toBeInTheDocument();
  });
});