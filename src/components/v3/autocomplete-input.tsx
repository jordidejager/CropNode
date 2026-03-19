'use client';

import * as React from 'react';
import { ArrowRight, FlaskConical, MapPin, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface Suggestion {
  type: 'product' | 'parcel' | 'date';
  label: string;
  sublabel?: string;
  value: string;
}

export interface AutocompleteInputProps {
  onSend: (text: string) => void;
  isProcessing: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  products: Array<{ naam: string; categorie?: string | null }>;
  fertilizers?: Array<{ name: string; category?: string | null }>;
  parcels: Array<{ name: string; crop: string; variety?: string | null; parcelName?: string }>;
  parcelGroups?: Array<{ name: string }>;
}

// ============================================================================
// Fuzzy matching
// ============================================================================

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // Allow 1 character typo for queries >= 3 chars
  if (q.length >= 3) {
    // For prefix matching: compare query against same-length prefix of target
    const maxDist = q.length <= 5 ? 1 : 2; // Allow 2 for longer queries
    return levenshtein(q, t.substring(0, q.length)) <= maxDist;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function getLastWord(text: string): { word: string; startIndex: number } {
  // Get the word currently being typed (last word after space)
  const match = text.match(/(\S+)$/);
  if (!match) return { word: '', startIndex: text.length };
  return { word: match[1], startIndex: text.length - match[1].length };
}

// ============================================================================
// Component
// ============================================================================

export function AutocompleteInput({
  onSend,
  isProcessing,
  value,
  onValueChange,
  placeholder = 'Wat heb je gespoten? (bijv. alle peren met Merpan 2L)',
  products,
  fertilizers = [],
  parcels,
  parcelGroups,
}: AutocompleteInputProps) {
  const [localInput, setLocalInput] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const input = value !== undefined ? value : localInput;
  const setInput = onValueChange || setLocalInput;

  // Build date suggestions with resolved dates (incl. time-of-day variants)
  const dateSuggestions = React.useMemo(() => {
    const today = new Date();
    const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const timeOfDay = ['ochtend', 'middag', 'avond', 'nacht'];

    const formatDate = (d: Date) => {
      return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
    };

    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    };

    const getMostRecentDay = (targetDay: number) => {
      const currentDay = today.getDay();
      let diff = currentDay - targetDay;
      if (diff <= 0) diff += 7;
      return addDays(today, -diff);
    };

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const suggestions: Suggestion[] = [
      { type: 'date' as const, label: 'Vandaag', sublabel: formatDate(today), value: 'vandaag' },
      { type: 'date' as const, label: 'Gisteren', sublabel: formatDate(addDays(today, -1)), value: 'gisteren' },
      { type: 'date' as const, label: 'Eergisteren', sublabel: formatDate(addDays(today, -2)), value: 'eergisteren' },
    ];

    // Time-of-day variants for vandaag/gisteren/eergisteren
    const relativeDates: Array<{ base: string; date: Date }> = [
      { base: 'vandaag', date: today },
      { base: 'gisteren', date: addDays(today, -1) },
      { base: 'eergisteren', date: addDays(today, -2) },
    ];
    for (const { base, date } of relativeDates) {
      for (const tod of timeOfDay) {
        suggestions.push({
          type: 'date' as const,
          label: `${cap(base)} ${tod}`,
          sublabel: `${formatDate(date)} · ${tod}`,
          value: `${base} ${tod}`,
        });
      }
    }

    // Add day names (most recent past occurrence) - skip today's day name
    for (let i = 0; i < 7; i++) {
      const dayNum = i;
      if (dayNum === today.getDay()) continue; // skip today
      const dayDate = getMostRecentDay(dayNum);
      const dayName = dayNames[dayNum];

      // Base day name
      suggestions.push({
        type: 'date' as const,
        label: cap(dayName),
        sublabel: formatDate(dayDate),
        value: dayName,
      });

      // Time-of-day compound variants: woensdagochtend, woensdagmiddag, etc.
      for (const tod of timeOfDay) {
        suggestions.push({
          type: 'date' as const,
          label: `${cap(dayName)}${tod}`,
          sublabel: `${formatDate(dayDate)} · ${tod}`,
          value: `${dayName}${tod}`,
        });
      }
    }

    return suggestions;
  }, []);

  // Build crop/variety group suggestions from parcels
  const cropGroups = React.useMemo(() => {
    const crops = new Map<string, number>();
    const varieties = new Map<string, { crop: string; count: number }>();

    for (const p of parcels) {
      if (p.crop) {
        crops.set(p.crop, (crops.get(p.crop) || 0) + 1);
      }
      if (p.variety) {
        const key = p.variety.toLowerCase();
        if (!varieties.has(key)) {
          varieties.set(key, { crop: p.crop, count: 0 });
        }
        varieties.get(key)!.count++;
      }
    }

    const groups: Suggestion[] = [];

    // "Alles" / "Alle percelen"
    if (parcels.length > 0) {
      groups.push({
        type: 'parcel',
        label: 'Alle percelen',
        sublabel: `${parcels.length} percelen`,
        value: 'alle percelen',
      });
    }

    // Crop groups: "Alle peren", "Alle appels"
    for (const [crop, count] of crops) {
      const plural = crop.toLowerCase() === 'peer' ? 'peren'
        : crop.toLowerCase() === 'appel' ? 'appels'
        : crop.toLowerCase() === 'kers' ? 'kersen'
        : crop.toLowerCase() === 'pruim' ? 'pruimen'
        : `${crop}s`;
      groups.push({
        type: 'parcel',
        label: `Alle ${plural}`,
        sublabel: `${count} percelen · ${crop}`,
        value: `alle ${plural}`,
      });
    }

    // Variety groups: "Alle Conference", "Alle Elstar" (only if multiple parcels)
    for (const [variety, info] of varieties) {
      if (info.count >= 2) {
        const displayName = variety.charAt(0).toUpperCase() + variety.slice(1);
        groups.push({
          type: 'parcel',
          label: `Alle ${displayName}`,
          sublabel: `${info.count} percelen · ${info.crop}`,
          value: `alle ${displayName}`,
        });
      }
    }

    return groups;
  }, [parcels]);

  // Build location-based group suggestions (e.g., "Alles thuis", "Alle peren thuis", "Heel murre")
  const locationGroups = React.useMemo(() => {
    // Group parcels by location (parcelName = parent parcel name like "Thuis", "Murre")
    const locations = new Map<string, Array<{ crop: string; variety?: string | null }>>();

    for (const p of parcels) {
      const loc = p.parcelName || '';
      if (!loc) continue;
      if (!locations.has(loc)) {
        locations.set(loc, []);
      }
      locations.get(loc)!.push({ crop: p.crop, variety: p.variety });
    }

    const pluralize = (crop: string) => {
      const c = crop.toLowerCase();
      return c === 'peer' ? 'peren' : c === 'appel' ? 'appels' : c === 'kers' ? 'kersen' : c === 'pruim' ? 'pruimen' : `${crop}s`;
    };

    const groups: Suggestion[] = [];

    for (const [loc, members] of locations) {
      // Only create location groups if the location has 2+ parcels
      if (members.length < 2) continue;

      const locDisplay = loc.charAt(0).toUpperCase() + loc.slice(1).toLowerCase();

      // "Alles [locatie]" / "Heel [locatie]" - all parcels at this location
      groups.push({
        type: 'parcel',
        label: `Alles ${locDisplay}`,
        sublabel: `${members.length} percelen`,
        value: `alles ${loc.toLowerCase()}`,
      });

      // "Alle [gewas] [locatie]" - per crop at this location (e.g., "Alle peren thuis")
      const cropCounts = new Map<string, number>();
      for (const m of members) {
        if (m.crop) cropCounts.set(m.crop, (cropCounts.get(m.crop) || 0) + 1);
      }
      for (const [crop, count] of cropCounts) {
        if (count >= 2) {
          groups.push({
            type: 'parcel',
            label: `Alle ${pluralize(crop)} ${locDisplay}`,
            sublabel: `${count} percelen · ${crop}`,
            value: `alle ${pluralize(crop)} ${loc.toLowerCase()}`,
          });
        }
      }

      // "Alle [ras] [locatie]" - per variety at this location (e.g., "Alle Conference thuis")
      const varietyCounts = new Map<string, { crop: string; count: number }>();
      for (const m of members) {
        if (m.variety) {
          const key = m.variety.toLowerCase();
          if (!varietyCounts.has(key)) {
            varietyCounts.set(key, { crop: m.crop, count: 0 });
          }
          varietyCounts.get(key)!.count++;
        }
      }
      for (const [variety, info] of varietyCounts) {
        if (info.count >= 2) {
          const displayName = variety.charAt(0).toUpperCase() + variety.slice(1);
          groups.push({
            type: 'parcel',
            label: `Alle ${displayName} ${locDisplay}`,
            sublabel: `${info.count} percelen · ${info.crop}`,
            value: `alle ${displayName} ${loc.toLowerCase()}`,
          });
        }
      }
    }

    return groups;
  }, [parcels]);

  // Compute suggestions when input changes
  React.useEffect(() => {
    const { word } = getLastWord(input);

    if (word.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const results: Suggestion[] = [];

    // Search date suggestions first (e.g., "gisteren", "woensdag", "woensdagavond")
    for (const d of dateSuggestions) {
      if (results.length >= 5) break; // Max 5 date suggestions (base + time-of-day variants)
      if (fuzzyMatch(word, d.label) || fuzzyMatch(word, d.value)) {
        results.push(d);
      }
    }

    // Search crop/variety groups (e.g., "alle peren", "alle conference", "alles")
    for (const g of cropGroups) {
      if (results.length >= 6) break;
      if (fuzzyMatch(word, g.label) || fuzzyMatch(word, g.value)) {
        results.push(g);
      }
    }

    // Search location-based groups (e.g., "alles thuis", "alle peren thuis", "heel murre")
    for (const g of locationGroups) {
      if (results.length >= 8) break;
      // Match on location name within label/value, or full label
      if (fuzzyMatch(word, g.label) || fuzzyMatch(word, g.value)) {
        // Avoid duplicates with cropGroups
        if (!results.some(r => r.value === g.value)) {
          results.push(g);
        }
      }
    }

    // Search CTGB products
    for (const p of products) {
      if (results.length >= 6) break;
      if (fuzzyMatch(word, p.naam)) {
        results.push({
          type: 'product',
          label: p.naam,
          sublabel: p.categorie || 'Gewasbeschermingsmiddel',
          value: p.naam,
        });
      }
    }

    // Search fertilizers (meststoffen)
    for (const f of fertilizers) {
      if (results.length >= 8) break;
      if (fuzzyMatch(word, f.name)) {
        results.push({
          type: 'product',
          label: f.name,
          sublabel: f.category || 'Meststof',
          value: f.name,
        });
      }
    }

    // Search parcels (only if not already many matches)
    if (results.length < 4) {
      // Check which varieties already have a group suggestion (e.g., "Alle Greenstar")
      // to avoid showing redundant individual parcels
      const varietyGroupsShown = new Set<string>();
      for (const r of results) {
        if (r.type === 'parcel' && r.label.startsWith('Alle ')) {
          varietyGroupsShown.add(r.label.replace('Alle ', '').toLowerCase());
        }
      }

      const seenNames = new Set<string>();
      for (const p of parcels) {
        if (results.length >= 6) break;
        const nameKey = p.name.toLowerCase();
        if (seenNames.has(nameKey)) continue;

        const matchesName = fuzzyMatch(word, p.name);
        const matchesVariety = p.variety && fuzzyMatch(word, p.variety);

        if (matchesName || matchesVariety) {
          // Skip if match is ONLY on variety and we already show a group for that variety
          if (!matchesName && matchesVariety && p.variety &&
              varietyGroupsShown.has(p.variety.toLowerCase())) {
            continue;
          }
          seenNames.add(nameKey);
          results.push({
            type: 'parcel',
            label: p.name,
            sublabel: `${p.crop}${p.variety ? ` · ${p.variety}` : ''}`,
            value: p.name,
          });
        }
      }

      // Search parcel groups
      if (parcelGroups) {
        for (const g of parcelGroups) {
          if (results.length >= 6) break;
          if (fuzzyMatch(word, g.name)) {
            results.push({
              type: 'parcel',
              label: g.name,
              sublabel: 'Perceelgroep',
              value: g.name,
            });
          }
        }
      }
    }

    setSuggestions(results);
    setShowDropdown(results.length > 0);
    setSelectedIndex(-1);
  }, [input, products, fertilizers, parcels, parcelGroups, cropGroups, locationGroups, dateSuggestions]);

  const handleSend = () => {
    if (input.trim() && !isProcessing) {
      setShowDropdown(false);
      onSend(input);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    const { startIndex } = getLastWord(input);
    const newInput = input.substring(0, startIndex) + suggestion.value + ' ';
    setInput(newInput);
    setShowDropdown(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && selectedIndex >= 0)) {
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        } else if (suggestions.length > 0) {
          handleSelectSuggestion(suggestions[0]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setSelectedIndex(-1);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Highlight matched portion in suggestion label
  const highlightMatch = (label: string, query: string) => {
    const idx = label.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{label}</span>;
    return (
      <span>
        {label.substring(0, idx)}
        <span className="text-emerald-400 font-semibold">{label.substring(idx, idx + query.length)}</span>
        {label.substring(idx + query.length)}
      </span>
    );
  };

  const { word: currentWord } = getLastWord(input);

  return (
    <div className="w-full max-w-4xl mx-auto px-2 md:px-4 pb-4 md:pb-8 pt-2 md:pt-4">
      <div className="relative">
        {/* Glow effect */}
        <AnimatePresence>
          {isFocused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="absolute -inset-[1px] rounded-xl md:rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(16,185,129,0.05), rgba(16,185,129,0.2))',
                filter: 'blur(1px)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Input bar */}
        <div className={cn(
          "relative group flex items-end gap-2 bg-black/50 backdrop-blur-xl border transition-all duration-300 p-1.5 md:p-2.5 rounded-xl md:rounded-2xl",
          isFocused ? 'border-emerald-500/30 bg-black/60' : 'border-white/[0.08] shadow-xl hover:border-white/[0.12]'
        )}>
          <div className="flex-grow pl-2 md:pl-3 py-1 md:py-1.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                // Delay hiding dropdown so click events can fire
                setTimeout(() => setShowDropdown(false), 200);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              data-testid="v3-input"
              className="w-full bg-transparent border-none text-white focus:ring-0 resize-none text-sm font-medium py-1 placeholder:text-white/25 max-h-48 scrollbar-thin outline-none"
            />
          </div>

          <div className="pb-0.5 md:pb-1 pr-0.5 md:pr-1">
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              size="icon"
              data-testid="v3-send"
              className={cn(
                "h-9 w-9 md:h-10 md:w-10 rounded-lg md:rounded-xl transition-all duration-300",
                input.trim()
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]'
                  : 'bg-white/5 text-muted-foreground'
              )}
            >
              {isProcessing ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Autocomplete dropdown */}
        <AnimatePresence>
          {showDropdown && suggestions.length > 0 && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
            >
              {suggestions.map((suggestion, idx) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}-${idx}`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent textarea blur
                    handleSelectSuggestion(suggestion);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-sm",
                    idx === selectedIndex
                      ? 'bg-emerald-500/15 text-white'
                      : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                  )}
                >
                  <div className={cn(
                    "h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0",
                    suggestion.type === 'product' ? 'bg-blue-500/20 text-blue-400'
                      : suggestion.type === 'date' ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-amber-500/20 text-amber-400'
                  )}>
                    {suggestion.type === 'product' ? (
                      <FlaskConical className="h-3.5 w-3.5" />
                    ) : suggestion.type === 'date' ? (
                      <Calendar className="h-3.5 w-3.5" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="truncate text-sm">
                      {highlightMatch(suggestion.label, currentWord)}
                    </div>
                    {suggestion.sublabel && (
                      <div className="text-[10px] text-white/30 truncate">{suggestion.sublabel}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-white/20 flex-shrink-0">
                    {suggestion.type === 'product' ? 'Product' : suggestion.type === 'date' ? 'Datum' : 'Perceel'}
                  </span>
                </button>
              ))}
              <div className="px-3 py-1.5 text-[10px] text-white/15 border-t border-white/5">
                ↑↓ navigeren · Tab selecteren · Enter versturen
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <p className="hidden md:block text-[10px] text-center text-white/15 font-medium tracking-[0.15em] mt-2">
        Enter om te versturen · Tab voor suggestie · Shift+Enter voor nieuwe regel
      </p>
    </div>
  );
}
