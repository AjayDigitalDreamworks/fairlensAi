"use client";

import { useTheme } from "@/components/ThemeProvider";
import { motion, AnimatePresence } from "framer-motion";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn group relative flex items-center gap-2.5 px-3 py-2 border rounded-md backdrop-blur-md transition-all duration-500 hover:scale-[1.03] active:scale-[0.97] cursor-pointer select-none"
      aria-label={`Switch to ${theme === "emerald" ? "Sapphire" : "Emerald"} theme`}
      title={`Currently: ${theme === "emerald" ? "Emerald" : "Sapphire"} • Click to switch`}
    >
      {/* Animated icon area */}
      <div className="relative w-5 h-5 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {theme === "emerald" ? (
            <motion.div
              key="emerald-icon"
              initial={{ y: 14, opacity: 0, rotate: -90 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -14, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute"
            >
              {/* Emerald diamond icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]">
                <rect x="4" y="4" width="8" height="8" rx="1" stroke="#10b981" strokeWidth="1.5" fill="#10b98120" />
                <rect x="6" y="6" width="4" height="4" fill="#10b981" opacity="0.6" />
              </svg>
            </motion.div>
          ) : (
            <motion.div
              key="sapphire-icon"
              initial={{ y: 14, opacity: 0, rotate: -90 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -14, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute"
            >
              {/* Sapphire gem icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="drop-shadow-[0_0_6px_rgba(77,163,255,0.5)]">
                <circle cx="8" cy="8" r="5" stroke="#4DA3FF" strokeWidth="1.5" fill="#4DA3FF20" />
                <circle cx="8" cy="8" r="2.5" fill="#7B61FF" opacity="0.6" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] opacity-80 group-hover:opacity-100 transition-opacity hidden sm:inline">
        {theme === "emerald" ? "Emerald" : "Sapphire"}
      </span>

      {/* Animated gradient underline */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div
          className={`h-full w-full ${
            theme === "emerald"
              ? "bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              : "bg-gradient-to-r from-transparent via-[#4DA3FF] to-transparent"
          }`}
        />
      </div>
    </button>
  );
}
