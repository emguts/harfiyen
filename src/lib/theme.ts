// The colour theme: the system's, or light or dark as chosen in Settings. index.html applies the saved choice
// before the first paint; this keeps it applied, follows the system while it is the choice, and tells the
// components that draw on canvases when it changes.

import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "harfiyen.theme";
/** The browser's own bar takes the header's colour (--pane). */
const BAR: Record<Theme, string> = { dark: "#16191d", light: "#fbfcfd" };
const system = window.matchMedia("(prefers-color-scheme: light)");
const listeners = new Set<() => void>();

function load(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Unreadable: the system's.
  }
  return "system";
}

let choice = load();
let theme: Theme = "dark";

function apply() {
  theme = choice === "system" ? (system.matches ? "light" : "dark") : choice;
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[theme]);
  listeners.forEach((l) => l());
}

apply();
system.addEventListener("change", () => choice === "system" && apply());

export function setThemeChoice(next: ThemeChoice) {
  choice = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not remembered; still applied.
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What is chosen in Settings. */
export const useThemeChoice = () => useSyncExternalStore(subscribe, () => choice);

/** The theme in use: the choice, or the system's when that is the choice. */
export const useTheme = () => useSyncExternalStore(subscribe, () => theme);
