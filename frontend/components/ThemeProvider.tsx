"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type ThemeName = "emerald" | "sapphire";

interface ThemeContextType {
  theme: ThemeName;
  toggleTheme: () => void;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("emerald");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("fairai-theme") as ThemeName | null;
    if (stored === "emerald" || stored === "sapphire") {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("fairai-theme", theme);
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "emerald" ? "sapphire" : "emerald"));
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
