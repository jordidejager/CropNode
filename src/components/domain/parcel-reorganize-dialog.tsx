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
import { Loader2, Merge, ChevronRight, Check, AlertTriangle, Sparkles, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

interface MergeSuggestion {
  prefix: string;
  parcels: { id: string; name: string }[];
}

type RawParcel = { id: string; name: string };

interface ParcelReorganizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Default tab — 'auto' (suggesties) of 'manual' (handmatig). */
  defaultTab?: "auto" | "manual";
}

export function ParcelReorganizeDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultTab = "auto",
}: ParcelReorganizeDialogProps) {
  const [tab, setTab] = useState<"auto" | "manual">(defaultTab);

  // Auto-tab state
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MergeSuggestion | null>(null);
  const [autoTargetName, setAutoTargetName] = useState("");
  const [successCount, setSuccessCount] = useState(0);

  // Manual-tab state
  const [allParcels, setAllParcels] = useState<RawParcel[]>([]);
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set());
  const [manualTargetName, setManualTargetName] = useState("");
  const [manualSearch, setManualSearch] = useState("");

  // Shared
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open + load data
  useEffect(() => {
    if (!open) {
      setTab(defaultTab);
      setSelectedSuggestion(null);
      setAutoTargetName("");
      setManualSelectedIds(new Set());
      setManualTargetName("");
      setManualSearch("");
      setError(null);
      setSuccessCount(0);
      return;
    }

    setLoading(true);

    // Suggesties ophalen
    fetch("/api/parcels/reorganize")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSuggestions(data.data.suggestions || []);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));

    // Alle parcels voor handmatig-tab
    supabase
      .from("parcels")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setAllParcels(data as RawParcel[]);
      });
  }, [open, defaultTab]);

  // ---- Handlers: AUTO ----
  const handleSelectSuggestion = (suggestion: MergeSuggestion) => {
    setSelectedSuggestion(suggestion);
    setAutoTargetName(suggestion.prefix);
    setError(null);
  };

  const handleAutoMerge = async () => {
    if (!selectedSuggestion || !autoTargetName.trim()) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/parcels/reorganize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetName: autoTargetName.trim(),
          parcelIds: selectedSuggestion.parcels.map((p) => p.id),
          stripPrefix: selectedSuggestion.prefix,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessCount((p) => p + 1);
        setSuggestions((prev) => prev.filter((s) => s.prefix !== selectedSuggestion.prefix));
        setSelectedSuggestion(null);
        setAutoTargetName("");
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

  // ---- Handlers: MANUAL ----
  const toggleManualParcel = (id: string) => {
    setManualSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleManualMerge = async () => {
    if (manualSelectedIds.size < 2 || !manualTargetName.trim()) {
      setError("Selecteer minimaal 2 percelen en geef een hoofdperceel-naam op.");
      return;
    }
    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/parcels/reorganize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetName: manualTargetName.trim(),
          parcelIds: Array.from(manualSelectedIds),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessCount((p) => p + 1);
        setManualSelectedIds(new Set());
        setManualTargetName("");
        // Reload parcels to reflect deletions
        const { data: fresh } = await supabase
          .from("parcels")
          .select("id, name")
          .order("name");
        if (fresh) setAllParcels(fresh as RawParcel[]);
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

  const filteredManualParcels = manualSearch.trim()
    ? allParcels.filter((p) => p.name.toLowerCase().includes(manualSearch.toLowerCase()))
    : allParcels;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0A0A0A] border-white/10 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Merge className="h-5 w-5 text-primary" />
            Percelen Reorganiseren
          </DialogTitle>
          <DialogDescription>
            Voeg gerelateerde percelen samen tot hoofdpercelen met subpercelen.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => { setTab("auto"); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === "auto"
                ? "bg-primary/20 text-primary"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Suggesties
          </button>
          <button
            type="button"
            onClick={() => { setTab("manual"); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === "manual"
                ? "bg-primary/20 text-primary"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Handmatig
          </button>
        </div>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          {/* AUTO TAB */}
          {tab === "auto" && (
            loading ? (
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
                  Gebruik de "Handmatig" tab om zelf percelen te koppelen.
                </p>
              </div>
            ) : selectedSuggestion ? (
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
                    value={autoTargetName}
                    onChange={(e) => setAutoTargetName(e.target.value)}
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
                              {autoTargetName} &mdash; {newSubName || "(hoofdblok)"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-white/30">
                  {suggestions.length} groep{suggestions.length !== 1 ? "en" : ""} gevonden
                  die samengevoegd kunnen worden:
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s.prefix}
                    onClick={() => handleSelectSuggestion(s)}
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
            )
          )}

          {/* MANUAL TAB */}
          {tab === "manual" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Naam hoofdperceel
                </label>
                <Input
                  value={manualTargetName}
                  onChange={(e) => setManualTargetName(e.target.value)}
                  className="mt-1 bg-white/5 border-white/10"
                  placeholder="Bijv. Jan van W"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Selecteer percelen om samen te voegen
                  {manualSelectedIds.size > 0 && (
                    <span className="ml-2 text-primary normal-case font-normal">
                      ({manualSelectedIds.size} geselecteerd)
                    </span>
                  )}
                </label>
                <Input
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  placeholder="Zoek perceel..."
                  className="mt-1 mb-2 bg-white/5 border-white/10"
                />
                <div className="max-h-[280px] overflow-y-auto space-y-1 rounded-lg border border-white/[0.06] p-2 bg-white/[0.02]">
                  {filteredManualParcels.length === 0 ? (
                    <div className="text-center text-xs text-white/30 py-4">Geen percelen gevonden</div>
                  ) : (
                    filteredManualParcels.map((p) => {
                      const checked = manualSelectedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleManualParcel(p.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                            checked
                              ? "bg-primary/15 text-primary"
                              : "text-white/70 hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 items-center justify-center rounded border-2 shrink-0 ${
                              checked ? "bg-primary border-primary text-primary-foreground" : "border-white/20"
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {manualSelectedIds.size >= 2 && manualTargetName.trim() && (
                <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary/80">
                  Na samenvoegen: <strong>{manualTargetName}</strong> wordt het hoofdperceel met{" "}
                  {manualSelectedIds.size} subpercelen.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          {tab === "auto" && selectedSuggestion ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setSelectedSuggestion(null)}
                className="flex-1 border-white/10"
              >
                Annuleren
              </Button>
              <Button
                onClick={handleAutoMerge}
                disabled={merging || !autoTargetName.trim()}
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
          ) : tab === "manual" ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-white/10"
              >
                Sluiten
              </Button>
              <Button
                onClick={handleManualMerge}
                disabled={merging || manualSelectedIds.size < 2 || !manualTargetName.trim()}
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
                    Samenvoegen ({manualSelectedIds.size})
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
