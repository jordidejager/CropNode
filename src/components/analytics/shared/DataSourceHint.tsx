'use client';

import Link from 'next/link';
import { Info, ArrowRight } from 'lucide-react';

interface DataSourceHintProps {
  /** Korte uitleg wat voor data */
  label: string;
  /** Waar invoer gebeurt */
  links: Array<{ href: string; text: string }>;
  /** Compacte inline variant of losse banner */
  variant?: 'inline' | 'banner';
}

/**
 * Toont een subtiele link naar waar data bijgewerkt kan worden.
 * Vermindert frictie voor gebruikers die niet weten waar data vandaan komt.
 */
export function DataSourceHint({ label, links, variant = 'inline' }: DataSourceHintProps) {
  if (variant === 'banner') {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 flex items-start gap-2">
        <Info className="size-3.5 text-slate-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-[11px] text-slate-400 leading-snug">
            {label}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-0.5"
              >
                {l.text}
                <ArrowRight className="size-3" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Inline (compacter, voor onder een chart/tabel)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-600 mt-1">
      <Info className="size-3" />
      <span>{label}</span>
      {links.map((l, i) => (
        <Link
          key={l.href}
          href={l.href}
          className="text-emerald-500/80 hover:text-emerald-400 transition-colors inline-flex items-center gap-0.5"
        >
          {i > 0 && <span className="text-slate-700 mr-0.5">·</span>}
          {l.text}
          <ArrowRight className="size-2.5" />
        </Link>
      ))}
    </div>
  );
}
