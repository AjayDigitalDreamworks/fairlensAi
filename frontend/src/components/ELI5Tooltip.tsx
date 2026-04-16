"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, BookOpen, X } from "lucide-react";
import { lookupTerm } from "@/lib/glossary";

/**
 * Wraps a technical term with an underlined dashed style.
 * On click/hover, shows a beautiful tooltip with:
 *  - Short plain-language summary
 *  - Long explanation
 *  - Optional real-world example
 */
export function ELI5Tooltip({
  term,
  children,
  side = "top",
}: {
  term: string;
  children?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const entry = lookupTerm(term);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!entry) {
    // If no glossary entry, just render children
    return <>{children ?? term}</>;
  }

  const posClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[side];

  return (
    <span ref={ref} className="relative inline-block">
      <span
        onClick={() => setOpen((v) => !v)}
        className="cursor-help border-b border-dashed border-emerald-400/60 text-inherit hover:border-emerald-400 transition-colors"
        title={entry.short}
      >
        {children ?? term}
      </span>

      {open && (
        <div
          className={`absolute z-[100] w-72 max-w-xs rounded-xl border border-emerald-500/20 bg-black/95 p-4 shadow-2xl shadow-black/70 backdrop-blur-xl ${posClass}`}
        >
          {/* Header */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-emerald-300">
                {term}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 text-muted-foreground hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Short */}
          <p className="text-sm font-semibold text-white leading-relaxed mb-2">
            {entry.short}
          </p>

          {/* Long */}
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {entry.long}
          </p>

          {/* Example */}
          {entry.example && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400 mb-1">
                Real-world example
              </p>
              <p className="text-xs text-amber-100/80 leading-relaxed">
                {entry.example}
              </p>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * A small "?" badge that can be placed next to any label.
 * Opens the same glossary tooltip on click.
 */
export function TermBadge({
  term,
  className = "",
}: {
  term: string;
  className?: string;
}) {
  const entry = lookupTerm(term);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!entry) return null;

  return (
    <span ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 text-muted-foreground hover:text-emerald-400 transition-colors"
        title={`What is ${term}?`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100] w-72 max-w-xs rounded-xl border border-emerald-500/20 bg-black/95 p-4 shadow-2xl shadow-black/70 backdrop-blur-xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-emerald-300">
                {term}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 text-muted-foreground hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm font-semibold text-white leading-relaxed mb-2">
            {entry.short}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {entry.long}
          </p>
          {entry.example && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400 mb-1">
                Real-world example
              </p>
              <p className="text-xs text-amber-100/80 leading-relaxed">
                {entry.example}
              </p>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * A floating "ELI5 Mode" toggle button that can be placed in page headers.
 * Emits an onToggle() callback when flipped.
 */
export function ELI5ModeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.25em] transition-all ${
        enabled
          ? "border-amber-400/50 bg-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.2)]"
          : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"
      }`}
    >
      <BookOpen className="h-3 w-3" />
      {enabled ? "ELI5 On" : "ELI5 Off"}
    </button>
  );
}
