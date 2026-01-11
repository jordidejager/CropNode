"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2 } from "lucide-react";
import { searchAddress, parsePointString } from "@/lib/rvo-api";
import { useDebounce } from "@/hooks/use-debounce";
import type { AddressSuggestion } from "@/lib/types";

interface RvoMapControlsProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

export function RvoMapControls({ onLocationSelect }: RvoMapControlsProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Search for addresses
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const search = async () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsSearching(true);
      try {
        const results = await searchAddress(
          debouncedQuery,
          abortControllerRef.current.signal
        );
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Search error:", err);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    };

    search();
  }, [debouncedQuery]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuggestionClick = (suggestion: AddressSuggestion) => {
    const coords = parsePointString(suggestion.centroide_ll);
    if (coords) {
      onLocationSelect(coords.lat, coords.lng);
      setQuery(suggestion.weergavenaam);
      setShowSuggestions(false);
    }
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLocationSelect(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  return (
    <div ref={containerRef} className="flex gap-2">
      {/* Search input */}
      <div className="relative flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Zoek adres of plaats..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className="pl-9 pr-4 bg-background"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto z-50">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              >
                {suggestion.weergavenaam}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* My Location button */}
      <Button
        variant="secondary"
        size="icon"
        onClick={handleMyLocation}
        disabled={isLocating || !navigator.geolocation}
        title="Mijn locatie"
      >
        {isLocating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
