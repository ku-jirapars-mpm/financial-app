"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-only UI preferences. Never put financial data in this store —
 * it is persisted to localStorage on the device.
 */
interface UiState {
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      hideAmounts: false,
      toggleHideAmounts: () => set((s) => ({ hideAmounts: !s.hideAmounts })),
    }),
    { name: "myfinance-ui" },
  ),
);
