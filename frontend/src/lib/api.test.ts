import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { api, getApiErrorMessage } from "@/lib/api";
import { useAuthStore, type User } from "@/store/useAuthStore";

const asAxiosError = (payload: Record<string, unknown>) => ({
  isAxiosError: true,
  ...payload,
});

describe("getApiErrorMessage", () => {
  it("prefers the API's top-level message", () => {
    const error = asAxiosError({ response: { data: { message: "Slot taken" } } });
    expect(getApiErrorMessage(error)).toBe("Slot taken");
  });

  it("reads the first message from an errors array", () => {
    const error = asAxiosError({ response: { data: { errors: ["Email already in use"] } } });
    expect(getApiErrorMessage(error)).toBe("Email already in use");

    const objectErrors = asAxiosError({
      response: { data: { errors: [{ message: "Field invalid" }] } },
    });
    expect(getApiErrorMessage(objectErrors)).toBe("Field invalid");
  });

  it("reads the first value from an errors object (zod/express-validator shapes)", () => {
    const error = asAxiosError({
      response: { data: { errors: { email: "Invalid email" } } },
    });
    expect(getApiErrorMessage(error)).toBe("Invalid email");

    const nested = asAxiosError({
      response: { data: { errors: { email: ["Too short"] } } },
    });
    expect(getApiErrorMessage(nested)).toBe("Too short");
  });

  it("explains network failures when there is no response", () => {
    const error = asAxiosError({});
    expect(getApiErrorMessage(error)).toMatch(/Unable to reach the server/);
  });

  it("falls back for unknown errors", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("boom");
    expect(getApiErrorMessage("weird")).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("api interceptors", () => {
  const user: User = {
    id: "u1",
    name: "Ada",
    email: "ada@example.com",
    role: "CUSTOMER",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().logout();
  });

  it("request interceptor attaches the Authorization header when a token exists", async () => {
    useAuthStore.getState().setAuth(user, "tok-123");
    const requestInterceptor = (
      api.interceptors.request as unknown as {
        handlers: Array<{ fulfilled: (c: { headers: Record<string, string> }) => { headers: Record<string, string> } }>;
      }
    ).handlers[0].fulfilled;

    const config = await requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBe("Bearer tok-123");
  });

  it("401 → refreshes via cookie, updates the token, retries the request", async () => {
    useAuthStore.getState().setAuth(user, "stale-token");
    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { data: { accessToken: "fresh-token" } } });

    const rejected = (
      api.interceptors.response as unknown as {
        handlers: Array<{ rejected: (e: unknown) => Promise<unknown> }>;
      }
    ).handlers[0].rejected;

    // The retried request itself will fail (no server in jsdom) — the refresh
    // side effects above it are what this test asserts.
    await rejected({
      response: { status: 401 },
      config: { url: "/appointments", headers: {} },
    }).catch(() => {});

    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh-token"),
      {},
      { withCredentials: true }
    );
    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
  });

  it("401 with no session does not hijack navigation on failed refresh", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(new Error("no refresh cookie"));

    const rejected = (
      api.interceptors.response as unknown as {
        handlers: Array<{ rejected: (e: unknown) => Promise<unknown> }>;
      }
    ).handlers[0].rejected;

    await expect(
      rejected({
        response: { status: 401 },
        config: { url: "/services", headers: {} },
      })
    ).rejects.toThrow("no refresh cookie");

    // Anonymous visitors stay on the page — no forced bounce to /login
    expect(window.location.href).not.toBe("/login");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("failed refresh logs the session out", async () => {
    useAuthStore.getState().setAuth(user, "stale-token");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh failed"));

    const rejected = (
      api.interceptors.response as unknown as {
        handlers: Array<{ rejected: (e: unknown) => Promise<unknown> }>;
      }
    ).handlers[0].rejected;

    await expect(
      rejected({
        response: { status: 401 },
        config: { url: "/dashboard", headers: {} },
      })
    ).rejects.toThrow("refresh failed");

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
