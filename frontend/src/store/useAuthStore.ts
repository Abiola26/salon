import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "ADMIN" | "CUSTOMER";
  readonly phone?: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null; // in-memory only, not persisted
  refreshToken: string | null;
  isHydrated: boolean;
}

interface AuthActions {
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setHydrated: () => void;
}

type PersistedState = Pick<AuthState, "user" | "refreshToken">;

const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      updateTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "salon-auth-storage",
      storage: createJSONStorage<PersistedState>(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage
      ),
      partialize: (state): PersistedState => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
