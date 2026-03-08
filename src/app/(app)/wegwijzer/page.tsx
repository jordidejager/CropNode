'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Compass,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Lightbulb,
  BookOpen,
  Zap,
  Link2,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { wegwijzerSections, type WegwijzerSection } from '@/lib/wegwijzer-content';
import { SamenhangDiagram } from './samenhang-diagram';

// Group sections by parentLabel for the TOC
const sectionGroups = wegwijzerSections.reduce<Record<string, WegwijzerSection[]>>((acc, section) => {
  if (!acc[section.parentLabel]) acc[section.parentLabel] = [];
  acc[section.parentLabel].push(section);
  return acc;
}, {});

function SectionCard({ section, isOpen, onToggle }: {
  section: WegwijzerSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [isOpen]);

  const Icon = section.icon;

  return (
    <div
      id={section.id}
      className="scroll-mt-24 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300"
    >
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 text-left group"
      >
        <div className={cn(
          "size-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
          isOpen ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-white/5 border border-white/10 group-hover:border-emerald-500/20"
        )}>
          <Icon className={cn(
            "size-5 transition-colors",
            isOpen ? "text-emerald-400" : "text-slate-400 group-hover:text-emerald-400"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/60">{section.parentLabel}</span>
          </div>
          <h3 className="text-base font-bold text-white mt-0.5">{section.title}</h3>
          <p className="text-sm text-slate-400 mt-0.5 truncate">{section.shortDescription}</p>
        </div>
        <div className={cn(
          "size-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
          isOpen ? "bg-emerald-500/10 rotate-180" : "bg-white/5"
        )}>
          <ChevronDown className={cn(
            "size-4 transition-colors",
            isOpen ? "text-emerald-400" : "text-slate-500"
          )} />
        </div>
      </button>

      {/* Expanded content */}
      <div
        className="overflow-hidden transition-all duration-500 ease-in-out"
        style={{ maxHeight: isOpen ? contentHeight + 40 : 0 }}
      >
        <div ref={contentRef} className="px-5 pb-6 space-y-6">
          <div className="h-px bg-white/5" />

          {/* Wat is het? */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="size-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-emerald-400">Wat is {section.title}?</h4>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{section.wat}</p>
          </div>

          {/* Hoe werkt het? */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="size-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-emerald-400">Hoe werkt het?</h4>
            </div>
            <ul className="space-y-2">
              {section.hoeWerktHet.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="size-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Voorbeeld */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="size-4 text-amber-400" />
              <h4 className="text-sm font-bold text-amber-400">Voorbeeld</h4>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{section.voorbeeld}</p>
            </div>
          </div>

          {/* Tips */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="size-4 text-yellow-400" />
              <h4 className="text-sm font-bold text-yellow-400">Tips</h4>
            </div>
            <ul className="space-y-2">
              {section.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="text-yellow-400 shrink-0 mt-1">*</span>
                  <span className="leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Samenhang */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="size-4 text-sky-400" />
              <h4 className="text-sm font-bold text-sky-400">Samenhang</h4>
            </div>
            <ul className="space-y-2">
              {section.samenhang.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="text-sky-400 shrink-0 mt-1">&rarr;</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Link naar onderdeel */}
          <div className="pt-2">
            <Link
              href={section.route}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
            >
              Ga naar {section.title}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WegwijzerPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>('');
  const [tocOpen, setTocOpen] = useState(false);

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setOpenSections(prev => new Set(prev).add(id));
      setTocOpen(false);
    }
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 }
    );

    wegwijzerSections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const groupEntries = Object.entries(sectionGroups);

  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Compass className="size-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">Wegwijzer</h1>
            <p className="text-sm text-slate-400 font-medium">Leer CropNode kennen &mdash; van perceel tot oogst</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
          Deze pagina legt alle onderdelen van het platform uit met praktische voorbeelden.
          Of je nu net begint of een specifiek onderdeel beter wilt begrijpen &mdash; hier vind je alles.
          Gebruik het menu hieronder om direct naar een onderdeel te springen.
        </p>
      </div>

      <div className="flex gap-8">
        {/* Desktop TOC - sticky sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-20">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-2">Inhoud</h2>
            <nav className="space-y-4">
              {groupEntries.map(([group, sections]) => (
                <div key={group}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/50 px-2">{group}</span>
                  <ul className="mt-1 space-y-0.5">
                    {sections.map((section) => (
                      <li key={section.id}>
                        <button
                          onClick={() => scrollToSection(section.id)}
                          className={cn(
                            "w-full text-left text-xs px-2 py-1.5 rounded-lg transition-all truncate",
                            activeSection === section.id
                              ? "text-emerald-400 bg-emerald-500/10 font-semibold"
                              : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                          )}
                        >
                          {section.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <button
                  onClick={() => {
                    const el = document.getElementById('samenhang-diagram');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={cn(
                    "w-full text-left text-xs px-2 py-1.5 rounded-lg transition-all",
                    activeSection === 'samenhang-diagram'
                      ? "text-emerald-400 bg-emerald-500/10 font-semibold"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}
                >
                  Hoe alles samenhangt
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Mobile TOC dropdown */}
          <div className="lg:hidden mb-6 sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#020617]/95 backdrop-blur-md border-b border-white/5">
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/10"
            >
              <span className="text-sm font-semibold text-white">
                {activeSection
                  ? wegwijzerSections.find(s => s.id === activeSection)?.title || 'Ga naar onderdeel...'
                  : 'Ga naar onderdeel...'
                }
              </span>
              {tocOpen ? <X className="size-4 text-slate-400" /> : <Menu className="size-4 text-slate-400" />}
            </button>
            {tocOpen && (
              <div className="mt-2 p-3 rounded-xl bg-slate-900/95 border border-white/10 backdrop-blur-xl max-h-[60vh] overflow-y-auto custom-scrollbar">
                {groupEntries.map(([group, sections]) => (
                  <div key={group} className="mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/60 px-2">{group}</span>
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={cn(
                          "w-full text-left text-sm px-3 py-2 rounded-lg transition-all",
                          activeSection === section.id
                            ? "text-emerald-400 bg-emerald-500/10 font-semibold"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                ))}
                <button
                  onClick={() => {
                    const el = document.getElementById('samenhang-diagram');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTocOpen(false);
                  }}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Hoe alles samenhangt
                </button>
              </div>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {wegwijzerSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isOpen={openSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </div>

          {/* Samenhang Diagram */}
          <div id="samenhang-diagram" className="scroll-mt-24 mt-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Link2 className="size-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Hoe alles samenhangt</h2>
                <p className="text-sm text-slate-400">De verbindingen tussen alle onderdelen van CropNode</p>
              </div>
            </div>
            <SamenhangDiagram />
          </div>
        </div>
      </div>
    </div>
  );
}
