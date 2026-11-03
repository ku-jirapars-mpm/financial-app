"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-only UI preferences. Never put financial data in this store —
 * it is persisted to localStorage on the device.
 */
export type CardView = "available" | "owed";

interface UiState {
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  /** How credit cards are shown: credit left to spend, or amount owed. */
  cardView: CardView;
  setCardView: (v: CardView) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      hideAmounts: false,
      toggleHideAmounts: () => set((s) => ({ hideAmounts: !s.hideAmounts })),
      cardView: "available",
      setCardView: (cardView) => set({ cardView }),
    }),
    { name: "myfinance-ui" },
  ),
);
