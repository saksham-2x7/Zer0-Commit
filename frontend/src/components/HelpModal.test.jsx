import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HelpModal from "./HelpModal";

const onClose = vi.fn();

beforeEach(() => {
  onClose.mockReset();
});

describe("HelpModal", () => {
  test("renders the searchable help center as a page when asView is set", () => {
    render(<HelpModal language="en" onClose={onClose} asView />);

    expect(screen.getByRole("heading", { name: /how can we help you today/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search for help/i)).toBeInTheDocument();
    expect(screen.getByText("How to check a message")).toBeInTheDocument();
    expect(screen.getByText("What is redaction")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1930/i })).toBeInTheDocument();
  });

  test("search filters the FAQ list and shows a fallback when nothing matches", () => {
    render(<HelpModal language="en" onClose={onClose} asView />);

    fireEvent.change(screen.getByPlaceholderText(/search for help/i), {
      target: { value: "redaction" },
    });
    expect(screen.getByText("What is redaction")).toBeInTheDocument();
    expect(screen.queryByText("How to check a message")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search for help/i), {
      target: { value: "zzzzzz" },
    });
    expect(screen.getByText(/no help articles matched/i)).toBeInTheDocument();
  });

  test("clicking a browse topic filters to a related FAQ", () => {
    render(<HelpModal language="en" onClose={onClose} asView />);

    fireEvent.click(screen.getByRole("button", { name: /getting started/i }));

    expect(screen.getByText("How to check a message")).toBeInTheDocument();
    expect(screen.queryByText("What is redaction")).not.toBeInTheDocument();
  });

  test("submitting the contact form shows a confirmation", () => {
    render(<HelpModal language="en" onClose={onClose} asView />);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: "Suspicious SMS" } });
    fireEvent.click(screen.getByRole("button", { name: /submit case/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/noted your message/i);
  });

  test("opens as a modal dialog and closes on Escape", () => {
    render(<HelpModal language="en" onClose={onClose} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("the close button closes the dialog", () => {
    render(<HelpModal language="en" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /got it, close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});