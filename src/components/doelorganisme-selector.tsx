'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Target, ChevronDown, Loader2, Check, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getDoelorganismenWithAutoSelectAction } from '@/app/actions';
import type { DoelorganismeOption } from '@/lib/types';

interface DoelorganismeSelectorProps {
  productName: string;
  gewas?: string;
  selectedDoelorganisme?: string;
  onSelect: (doelorganisme: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * A selector component for choosing a doelorganisme (target organism) for a product.
 * Fetches available options from CTGB database and auto-selects based on user history.
 */
export function DoelorganismeSelector({
  productName,
  gewas,
  selectedDoelorganisme,
  onSelect,
  disabled = false,
  compact = false,
}: DoelorganismeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<DoelorganismeOption[]>([]);
  const [autoSelected, setAutoSelected] = useState<string | undefined>();
  const [autoSelectReason, setAutoSelectReason] = useState<'history' | 'default' | undefined>();
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch options when popover opens or when product/gewas changes
  const fetchOptions = useCallback(async () => {
    if (!productName) return;

    setIsLoading(true);
    try {
      const result = await getDoelorganismenWithAutoSelectAction(productName, gewas);
      setOptions(result.options);
      setAutoSelected(result.autoSelected);
      setAutoSelectReason(result.autoSelectReason);
      setHasFetched(true);

      // Auto-select if not already selected
      if (!selectedDoelorganisme && result.autoSelected) {
        onSelect(result.autoSelected);
      }
    } catch (error) {
      console.error('Failed to fetch doelorganismen:', error);
    } finally {
      setIsLoading(false);
    }
  }, [productName, gewas, selectedDoelorganisme, onSelect]);

  // Fetch when component mounts or product changes
  useEffect(() => {
    if (productName && !hasFetched) {
      fetchOptions();
    }
  }, [productName, hasFetched, fetchOptions]);

  // Re-fetch when popover opens (to get fresh data)
  useEffect(() => {
    if (isOpen && productName) {
      fetchOptions();
    }
  }, [isOpen, productName, fetchOptions]);

  const handleSelect = (doelorganisme: string) => {
    onSelect(doelorganisme);
    setIsOpen(false);
  };

  const displayValue = selectedDoelorganisme || 'Selecteer doel';
  const isAutoSelected = selectedDoelorganisme === autoSelected && autoSelectReason;
  const showAutoIndicator = isAutoSelected && autoSelectReason === 'history';

  if (compact) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
              selectedDoelorganisme
                ? "bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20"
                : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Target className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{displayValue}</span>
            {showAutoIndicator && <Sparkles className="h-3 w-3 text-yellow-500" />}
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </PopoverTrigger>
        <DoelorganismePopoverContent
          options={options}
          isLoading={isLoading}
          selectedDoelorganisme={selectedDoelorganisme}
          autoSelected={autoSelected}
          autoSelectReason={autoSelectReason}
          onSelect={handleSelect}
        />
      </Popover>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          className={cn(
            "w-full flex items-center justify-between gap-2 p-2.5 rounded-lg transition-colors text-left",
            selectedDoelorganisme
              ? "bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/15"
              : "bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Target className={cn(
              "h-4 w-4 flex-shrink-0",
              selectedDoelorganisme ? "text-teal-400" : "text-white/40"
            )} />
            <div className="min-w-0">
              <p className={cn(
                "text-sm truncate",
                selectedDoelorganisme ? "text-teal-400 font-medium" : "text-white/50"
              )}>
                {displayValue}
              </p>
              {showAutoIndicator && (
                <p className="text-[10px] text-white/30 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5 text-yellow-500" />
                  Eerder gebruikt
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isLoading ? (
              <Loader2 className="h-4 w-4 text-white/40 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4 text-white/40" />
            )}
          </div>
        </button>
      </PopoverTrigger>
      <DoelorganismePopoverContent
        options={options}
        isLoading={isLoading}
        selectedDoelorganisme={selectedDoelorganisme}
        autoSelected={autoSelected}
        autoSelectReason={autoSelectReason}
        onSelect={handleSelect}
      />
    </Popover>
  );
}

interface DoelorganismePopoverContentProps {
  options: DoelorganismeOption[];
  isLoading: boolean;
  selectedDoelorganisme?: string;
  autoSelected?: string;
  autoSelectReason?: 'history' | 'default';
  onSelect: (doelorganisme: string) => void;
}

function DoelorganismePopoverContent({
  options,
  isLoading,
  selectedDoelorganisme,
  autoSelected,
  autoSelectReason,
  onSelect,
}: DoelorganismePopoverContentProps) {
  return (
    <PopoverContent
      className="w-72 p-0 bg-zinc-900 border-white/10"
      align="start"
      sideOffset={4}
    >
      <div className="p-3 border-b border-white/[0.06]">
        <h4 className="text-sm font-medium text-white">Doelorganisme</h4>
        <p className="text-xs text-white/40 mt-0.5">
          Selecteer het doel waarvoor je spuit
        </p>
      </div>

      {isLoading ? (
        <div className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-white/40 animate-spin" />
        </div>
      ) : options.length === 0 ? (
        <div className="p-4 text-center">
          <p className="text-sm text-white/40">Geen doelorganismen gevonden</p>
          <p className="text-xs text-white/30 mt-1">
            Dit middel heeft geen specifieke doelen geregistreerd
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {options.map((option) => {
              const isSelected = selectedDoelorganisme === option.naam;
              const isAuto = autoSelected === option.naam;

              return (
                <button
                  key={option.naam}
                  onClick={() => onSelect(option.naam)}
                  className={cn(
                    "w-full flex items-start gap-2 p-2.5 rounded-md text-left transition-colors",
                    isSelected
                      ? "bg-teal-500/20 border border-teal-500/30"
                      : "hover:bg-white/[0.05] border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    isSelected ? "bg-teal-500" : "bg-white/10"
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn(
                        "text-sm truncate",
                        isSelected ? "text-teal-400 font-medium" : "text-white"
                      )}>
                        {option.naam}
                      </p>
                      {isAuto && autoSelectReason === 'history' && (
                        <Sparkles className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      {option.dosering && (
                        <span className="text-[10px] text-white/40">
                          Max: {option.dosering}
                        </span>
                      )}
                      {option.maxToepassingen && (
                        <span className="text-[10px] text-white/40">
                          {option.maxToepassingen}x/seizoen
                        </span>
                      )}
                      {option.veiligheidstermijn && (
                        <span className="text-[10px] text-white/40">
                          VGT: {option.veiligheidstermijn}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </PopoverContent>
  );
}
