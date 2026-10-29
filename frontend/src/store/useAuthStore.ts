import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "ADMIN" | "CUSTOMER";
  readonly phoneNumber?: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null; // in-memory only, not persisted
  isHydrated: boolean;
}

interface AuthActions {
  setAuth: (user: User, accessToken: string) => void;
  updateTokens: (accessToken: string) => void;
  logout: () => void;
  setHydrated: () => void;
}

type PersistedState = Pick<AuthState, "user">;

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
      isHydrated: false,
      // Refresh token lives in an httpOnly cookie (Phase 2) — the client only
      // stores the user profile; tokens never touch localStorage.
      setAuth: (user, accessToken) => set({ user, accessToken }),
      updateTokens: (accessToken) => set({ accessToken }),
      logout: () => set({ user: null, accessToken: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "salon-auth-storage",
      storage: createJSONStorage<PersistedState>(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage
      ),
      partialize: (state): PersistedState => ({
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
