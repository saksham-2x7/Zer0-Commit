import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BarcodeFormat } from "@zxing/browser";
import Scanner from "./Scanner";

let mockDecodeFromImageUrl;
let mockDecodeFromVideoDevice;

vi.mock("@zxing/browser", async () => {
  const actual = await vi.importActual("@zxing/browser");
  return {
    ...actual,
    BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
      decodeFromImageUrl: (...args) => mockDecodeFromImageUrl(...args),
      decodeFromVideoDevice: (...args) => mockDecodeFromVideoDevice(...args),
    })),
  };
});

vi.mock("../utils/productLookup", () => ({
  lookupProductByBarcode: vi.fn(),
}));

vi.mock("../services/api", () => ({
  getFoodFeedback: vi.fn(),
}));

import { lookupProductByBarcode } from "../utils/productLookup";
import { getFoodFeedback } from "../services/api";

function makeResult(text, format) {
  return { getText: () => text, getBarcodeFormat: () => format };
}

function getFileInput(container) {
  return container.querySelector('input[type="file"]');
}

function makeFile() {
  return new File([new Uint8Array(10)], "code.png", { type: "image/png" });
}

beforeEach(() => {
  mockDecodeFromImageUrl = vi.fn();
  mockDecodeFromVideoDevice = vi.fn();
  lookupProductByBarcode.mockReset();
  getFoodFeedback.mockReset();
  window.localStorage.clear();
});

describe("Scanner", () => {
  test("decoding a QR code shows the decoded text and a 'check for scams' action, not a product lookup", async () => {
    mockDecodeFromImageUrl.mockResolvedValue(
      makeResult("https://bit.ly/fake-upi-scam", BarcodeFormat.QR_CODE)
    );
    const onQrDecoded = vi.fn();
    const { container } = render(<Scanner language="en" onQrDecoded={onQrDecoded} />);

    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText(/QR code found/i);
    expect(screen.getByText("https://bit.ly/fake-upi-scam")).toBeInTheDocument();
    expect(lookupProductByBarcode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /check this for scams/i }));
    expect(onQrDecoded).toHaveBeenCalledWith("https://bit.ly/fake-upi-scam");
  });

  test("decoding a barcode looks up the product and shows the result", async () => {
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("8901030895555", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue({
      name: "Example Snacks",
      brand: "Example Co",
      imageUrl: null,
      nutriScore: "B",
    });

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText(/Barcode found/i);
    expect(lookupProductByBarcode).toHaveBeenCalledWith("8901030895555");
    await screen.findByText("Example Snacks");
    expect(screen.getByText(/Example Co/)).toBeInTheDocument();
  });

  test("shows 'not found' when the barcode isn't in the product database", async () => {
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("0000000000000", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue(null);

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText(/no product information was found/i);
  });

  test("a product with no name gets a safe, localized label before food feedback", async () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify(["diabetes"]));
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("8901030895555", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue({
      name: null,
      brand: null,
      imageUrl: null,
      nutriScore: null,
    });
    getFoodFeedback.mockResolvedValue({ feedback: "Contains added sugar." });

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText("Unknown product");
    expect(getFoodFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
        healthTags: ["diabetes"],
        product: expect.objectContaining({ name: "Unknown product" }),
      })
    );
    await screen.findByText(/contains added sugar/i);
  });

  test("food-feedback API errors are surfaced gracefully instead of crashing", async () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify(["diabetes"]));
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("8901030895555", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue({ name: "Example Snacks", brand: "Example Co" });
    getFoodFeedback.mockRejectedValue(
      Object.assign(new Error("Request failed with status code 400"), { code: "INVALID_REQUEST" })
    );

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText(/please paste a message or choose a screenshot first/i);
  });

  test("shows an error message when decoding fails", async () => {
    mockDecodeFromImageUrl.mockRejectedValue(new Error("not found"));

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't read a code/i);
  });
});

describe("Scanner — camera, reset, and profile setup", () => {
  test("starting the camera shows the live-scanning UI and stopping it cleanly stops the stream", async () => {
    const controls = { stop: vi.fn() };
    mockDecodeFromVideoDevice.mockResolvedValue(controls);
    render(<Scanner language="en" onQrDecoded={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /use camera/i }));
    await act(async () => {});
    expect(screen.getByText(/point the camera at the code/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop camera/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stop camera/i }));
    expect(controls.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /use camera/i })).toBeInTheDocument();
  });

  test("a denied camera permission surfaces the access message instead of crashing", async () => {
    mockDecodeFromVideoDevice.mockRejectedValue(new Error("NotAllowedError"));

    render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /use camera/i }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(/camera access was denied or unavailable/i);
  });

  test("scan-again resets the decoded result and returns to the scanner controls", async () => {
    mockDecodeFromImageUrl.mockResolvedValue(
      makeResult("https://bit.ly/fake-upi-scam", BarcodeFormat.QR_CODE)
    );
    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });
    await screen.findByText(/QR code found/i);

    fireEvent.click(screen.getByRole("button", { name: /scan another code/i }));
    expect(screen.getByRole("button", { name: /use camera/i })).toBeInTheDocument();
    expect(screen.queryByText(/QR code found/i)).not.toBeInTheDocument();
  });

  test("a product with image, brand, and nutriScore renders all detail rows", async () => {
    window.localStorage.setItem("scamsahayak-health-profile", JSON.stringify(["diabetes"]));
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("8901030895555", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue({
      name: "Example Snacks",
      brand: "Example Co",
      imageUrl: "https://img.example.com/snacks.png",
      nutriScore: "B",
    });
    getFoodFeedback.mockResolvedValue({ feedback: "Fine to eat." });

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText("Example Snacks");
    expect(screen.getByRole("img").getAttribute("src")).toContain("img.example.com");
    expect(screen.getByText("Example Co")).toBeInTheDocument();
    expect(screen.getByText(/nutri-score: b/i)).toBeInTheDocument();
    await screen.findByText(/fine to eat/i);
  });

  test("with no health profile the product card offers the setup link", async () => {
    mockDecodeFromImageUrl.mockResolvedValue(makeResult("8901030895555", BarcodeFormat.EAN_13));
    lookupProductByBarcode.mockResolvedValue({ name: "Example Snacks", brand: "Example Co" });

    const onSetupHealthProfile = vi.fn();
    const { container } = render(
      <Scanner language="en" onQrDecoded={vi.fn()} onSetupHealthProfile={onSetupHealthProfile} />
    );
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByText("Example Snacks");
    fireEvent.click(screen.getByRole("button", { name: /set up health profile/i }));
    expect(onSetupHealthProfile).toHaveBeenCalled();
  });

  test("a camera-decoded QR feeds straight into the check flow", async () => {
    const controls = { stop: vi.fn() };
    mockDecodeFromVideoDevice.mockImplementation((_unused, _video, callback) => {
      callback(makeResult("https://bit.ly/fake-upi-scam", BarcodeFormat.QR_CODE));
      return Promise.resolve(controls);
    });
    const onQrDecoded = vi.fn();
    render(<Scanner language="en" onQrDecoded={onQrDecoded} />);

    fireEvent.click(screen.getByRole("button", { name: /use camera/i }));
    await screen.findByText(/QR code found/i);

    fireEvent.click(screen.getByRole("button", { name: /check this for scams/i }));
    expect(onQrDecoded).toHaveBeenCalledWith("https://bit.ly/fake-upi-scam");
  });
});
