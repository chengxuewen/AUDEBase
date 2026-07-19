import { Storage } from "happy-dom";
import "@testing-library/jest-dom/vitest";

// happy-dom provides localStorage natively, but vitest's environment setup
// doesn't copy it to the global scope due to a Node.js 22 compatibility
// issue: 'localStorage' in globalThis === true, so getWindowKeys skips it.
// Use happy-dom's Storage directly instead of reimplementing a mock.
Object.defineProperty(globalThis, "localStorage", {
  value: new Storage(),
  writable: true,
  configurable: true,
});
