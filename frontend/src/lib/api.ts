import axios, { type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/useAuthStore";

const API_BASE_URL = typeof window !== "undefined"
  ? "/api"
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api");

interface ApiErrorPayload {
  message?: string;
  errors?: Array<{ message?: string } | string> | Record<string, unknown>;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
) => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const data = error.response?.data;
    if (data?.message) return data.message;

    if (Array.isArray(data?.errors)) {
      const firstError = data.errors[0];
      if (typeof firstError === "string") return firstError;
      if (firstError?.message) return firstError.message;
    }

    if (data?.errors && typeof data.errors === "object") {
      const [firstError] = Object.values(data.errors);
      if (typeof firstError === "string") return firstError;
      if (Array.isArray(firstError) && typeof firstError[0] === "string") {
        return firstError[0];
      }
    }

    if (!error.response) {
      return "Unable to reach the server. Please check your connection and try again.";
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request Interceptor: Attach access token
api.interceptors.request.use(
  (config) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle token rotation
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    // Check if the error is 401 Unauthorized and not already retried
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // If we are already refreshing, push this request to the queue
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token) originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = useAuthStore.getState().refreshToken;

      if (!refreshToken) {
        useAuthStore.getState().logout();
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        // Request token refresh
        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;

        // Update Zustand store
        useAuthStore.getState().updateTokens(newAccessToken, newRefreshToken);

        // Process any queued requests with the new token
        processQueue(null, newAccessToken);
        isRefreshing = false;

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token failed -> log out user
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        isRefreshing = false;

        // Redirect if in browser
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
