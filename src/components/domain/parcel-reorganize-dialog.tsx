"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Merge, ChevronRight, Check, AlertTriangle } from "lucide-react";

interface MergeSuggestion {
  prefix: string;
  parcels: { id: string; name: string }[];
}

interface ParcelReorganizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ParcelReorganizeDialog({
  open,
  onOpenChange,
  onSuccess,
}: ParcelReorganizeDialogProps) {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MergeSuggestion | null>(null);
  const [targetName, setTargetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  // Fetch suggestions when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedSuggestion(null);
      setTargetName("");
      setError(null);
      setSuccessCount(0);
      return;
    }

    setLoading(true);
    fetch("/api/parcels/reorganize")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSuggestions(data.data.suggestions || []);
        }
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelect = (suggestion: MergeSuggestion) => {
    setSelectedSuggestion(suggestion);
    setTargetName(suggestion.prefix);
    setError(null);
  };

  const handleMerge = async () => {
    if (!selectedSuggestion || !targetName.trim()) return;

    setMerging(true);
    setError(null);

    try {
      const res = await fetch("/api/parcels/reorganize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetName: targetName.trim(),
          parcelIds: selectedSuggestion.parcels.map((p) => p.id),
          stripPrefix: selectedSuggestion.prefix,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccessCount((prev) => prev + 1);
        // Remove merged suggestion from list
        setSuggestions((prev) =>
          prev.filter((s) => s.prefix !== selectedSuggestion.prefix)
        );
        setSelectedSuggestion(null);
        setTargetName("");
        onSuccess();
      } else {
        setError(data.error || "Er ging iets mis bij het samenvoegen.");
      }
    } catch {
      setError("Netwerkfout. Probeer opnieuw.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0A0A0A] border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Merge className="h-5 w-5 text-primary" />
            Percelen Reorganiseren
          </DialogTitle>
          <DialogDescription>
            Voeg gerelateerde percelen samen tot hoofdpercelen met subpercelen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-white/50">Analyseren...</span>
            </div>
          ) : suggestions.length === 0 && !selectedSuggestion ? (
            <div className="text-center py-8">
              <Check className="h-8 w-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-white/70 font-medium">
                {successCount > 0
                  ? `${successCount} groep${successCount > 1 ? "en" : ""} samengevoegd!`
                  : "Geen samenvoegbare percelen gevonden."}
              </p>
              <p className="text-xs text-white/30 mt-1">
                Alle percelen zijn al netjes georganiseerd.
              </p>
            </div>
          ) : selectedSuggestion ? (
            /* Merge detail view */
            <div className="space-y-4">
              <button
                onClick={() => setSelectedSuggestion(null)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                &larr; Terug naar suggesties
              </button>

              <div>
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Naam hoofdperceel
                </label>
                <Input
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="mt-1 bg-white/5 border-white/10"
                  placeholder="Bijv. Jachthoek"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Percelen die samengevoegd worden
                </label>
                <div className="mt-2 space-y-1">
                  {selectedSuggestion.parcels.map((p) => {
                    const newSubName = p.name.startsWith(selectedSuggestion.prefix)
                      ? p.name.slice(selectedSuggestion.prefix.length).trim()
                      : p.name;

                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white/50 line-through block truncate">
                            {p.name}
                          </span>
                        </div>
                        <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-primary font-medium block truncate">
                            {targetName} &mdash; {newSubName || "(hoofdblok)"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  <span className="text-xs text-red-300">{error}</span>
                </div>
              )}
            </div>
          ) : (
            /* Suggestions list */
            <div className="space-y-2">
              <p className="text-xs text-white/30">
                {suggestions.length} groep{suggestions.length !== 1 ? "en" : ""} gevonden
                die samengevoegd kunnen worden:
              </p>
              {suggestions.map((s) => (
                <button
                  key={s.prefix}
                  onClick={() => handleSelect(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-primary/30 transition-all text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-white group-hover:text-primary transition-colors block">
                      {s.prefix}
                    </span>
                    <span className="text-[11px] text-white/30 block mt-0.5 truncate">
                      {s.parcels.map((p) => p.name).join(", ")}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-white/20 shrink-0">
                    {s.parcels.length} percelen
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          {selectedSuggestion ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setSelectedSuggestion(null)}
                className="flex-1 border-white/10"
              >
                Annuleren
              </Button>
              <Button
                onClick={handleMerge}
                disabled={merging || !targetName.trim()}
                className="flex-1 bg-primary hover:bg-primary/90 font-bold"
              >
                {merging ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Samenvoegen...
                  </>
                ) : (
                  <>
                    <Merge className="mr-2 h-4 w-4" />
                    Samenvoegen
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10"
            >
              Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
