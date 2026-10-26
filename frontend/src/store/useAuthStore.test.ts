import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore, type User } from "@/store/useAuthStore";

const user: User = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "CUSTOMER",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    window.localStorage.clear();
  });

  it("setAuth stores the user and access token; logout clears both", () => {
    useAuthStore.getState().setAuth(user, "access-token");
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().accessToken).toBe("access-token");

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("updateTokens replaces only the access token", () => {
    useAuthStore.getState().setAuth(user, "old-token");
    useAuthStore.getState().updateTokens("new-token");

    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("persists only the user profile — tokens never reach localStorage", () => {
    useAuthStore.getState().setAuth(user, "super-secret-token");

    const raw = window.localStorage.getItem("salon-auth-storage");
    expect(raw).not.toBeNull();
    expect(raw).toContain("ada@example.com");
    expect(raw).not.toContain("super-secret-token");
  });

  it("setHydrated marks the store as hydrated (persist rehydration already ran in jsdom)", () => {
    useAuthStore.getState().setHydrated();
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });
});
