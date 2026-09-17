import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these — stub them so components that preview
// uploaded files (ImageUpload, evidence bundle download) don't crash.
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => "blob:mock-url";
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = () => {};
}

afterEach(() => {
  cleanup();
});
