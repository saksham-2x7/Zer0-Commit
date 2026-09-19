import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these — stub them so components that preview
// uploaded files (ImageUpload, evidence bundle download) don't crash.
// (Guarded: node-environment tests like crypto.test.js have no window.)
if (typeof window !== "undefined") {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => "blob:mock-url";
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }
}

afterEach(() => {
  cleanup();
});
