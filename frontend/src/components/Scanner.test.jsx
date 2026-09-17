import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BarcodeFormat } from "@zxing/library";
import Scanner from "./Scanner";

let mockDecodeFromImageUrl;

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromImageUrl: (...args) => mockDecodeFromImageUrl(...args),
    decodeFromVideoDevice: vi.fn(),
  })),
}));

vi.mock("../utils/productLookup", () => ({
  lookupProductByBarcode: vi.fn(),
}));

import { lookupProductByBarcode } from "../utils/productLookup";

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
  lookupProductByBarcode.mockReset();
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

  test("shows an error message when decoding fails", async () => {
    mockDecodeFromImageUrl.mockRejectedValue(new Error("not found"));

    const { container } = render(<Scanner language="en" onQrDecoded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /upload a photo instead/i }));
    fireEvent.change(getFileInput(container), { target: { files: [makeFile()] } });

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't read a code/i);
  });
});
