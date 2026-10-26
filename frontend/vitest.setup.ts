import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL auto-cleanup only wires itself when vitest globals are enabled — we
// import test APIs explicitly, so tear down manually between tests.
afterEach(() => {
  cleanup();
});
