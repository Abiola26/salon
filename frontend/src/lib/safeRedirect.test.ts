import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/safeRedirect";

describe("safeRedirect", () => {
  it("allows same-site absolute paths", () => {
    expect(safeRedirect("/dashboard", "/")).toBe("/dashboard");
    expect(safeRedirect("/admin?tab=users", "/")).toBe("/admin?tab=users");
    expect(safeRedirect("/book?service=1", "/login")).toBe("/book?service=1");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeRedirect("https://evil.com", "/login")).toBe("/login");
    expect(safeRedirect("http://evil.com/phish", "/login")).toBe("/login");
    expect(safeRedirect("//evil.com", "/login")).toBe("/login");
    expect(safeRedirect("/\\evil.com", "/login")).toBe("/login");
    expect(safeRedirect("javascript:alert(1)", "/login")).toBe("/login");
  });

  it("falls back on empty, null, or undefined values", () => {
    expect(safeRedirect(null, "/login")).toBe("/login");
    expect(safeRedirect(undefined, "/login")).toBe("/login");
    expect(safeRedirect("", "/login")).toBe("/login");
  });
});
