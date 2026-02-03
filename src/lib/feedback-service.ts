/**
 * Feedback Service (Fase 3.1.5 + Punt 6)
 *
 * Learns from user corrections and preferences to improve future suggestions.
 * Tracks:
 * - Preferred dosages per product
 * - Common parcel groupings
 * - Product combinations
 * - Correction patterns
 * - Product alias corrections (Punt 6)
 * - Exception patterns (Punt 6)
 *
 * Storage Strategy:
 * - localStorage for fast client-side access
 * - Supabase for cross-device persistence and analytics
 */

import type { UserFeedback } from './types';
// Use server-compatible supabase client (no 'use client' directive)
import { supabase } from './supabase-client';
import { withRetry } from './retry-utils';
import { getCurrentUserId } from './supabase-store';

// ============================================
// Punt 6: Feedback Types
// ============================================

export type FeedbackCorrectionType =
  | 'product_alias'     // User corrected a product name mapping
  | 'dosage_preference' // User changed the default dosage
  | 'parcel_group'      // User corrected a parcel group mapping
  | 'product_combo'     // User often uses these products together
  | 'exception_pattern' // User corrected an exception (e.g., "Kanzi niet")
  | 'general';          // Other corrections

export interface SmartInputFeedback {
  id: string;
  userId: string;
  correctionType: FeedbackCorrectionType;
  originalValue: string;
  correctedValue: string;
  context: Record<string, unknown>;
  frequency: number;
  lastUsedAt: Date;
  createdAt: Date;
}

// In-memory cache for feedback data (persisted to localStorage in browser)
let feedbackCache: Map<string, UserFeedback> = new Map();
const STORAGE_KEY = 'agribot_user_feedback';

// ============================================
// Storage Functions
// ============================================

/**
 * Initialize the feedback cache from localStorage
 */
export function initializeFeedbackCache(): void {
    if (typeof window === 'undefined') return;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored) as UserFeedback[];
            feedbackCache = new Map(data.map(f => [f.id, f]));
        }
    } catch (e) {
        console.error('Failed to load feedback cache:', e);
    }
}

/**
 * Save feedback cache to localStorage
 */
function saveFeedbackCache(): void {
    if (typeof window === 'undefined') return;

    try {
        const data = Array.from(feedbackCache.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save feedback cache:', e);
    }
}

// ============================================
// Feedback Recording Functions
// ============================================

/**
 * Record a dosage preference
 * Called when user confirms a registration with a specific dosage
 */
export function recordDosagePreference(
    productName: string,
    dosage: number,
    unit: string
): void {
    const key = productName.toLowerCase();
    const id = `dosage:${key}`;
    const value = `${dosage} ${unit}`;

    const existing = feedbackCache.get(id);
    if (existing) {
        // Update frequency and value
        feedbackCache.set(id, {
            ...existing,
            value,
            frequency: existing.frequency + 1,
            lastUsed: new Date()
        });
    } else {
        feedbackCache.set(id, {
            id,
            type: 'dosage',
            key,
            value,
            frequency: 1,
            lastUsed: new Date()
        });
    }

    saveFeedbackCache();
}

/**
 * Record a parcel group preference
 * Called when user uses a group like "alle appels"
 */
export function recordParcelGroupPreference(
    groupName: string,
    parcelIds: string[]
): void {
    const key = groupName.toLowerCase();
    const id = `parcel_group:${key}`;
    const value = parcelIds.join(',');

    const existing = feedbackCache.get(id);
    if (existing) {
        feedbackCache.set(id, {
            ...existing,
            value,
            frequency: existing.frequency + 1,
            lastUsed: new Date()
        });
    } else {
        feedbackCache.set(id, {
            id,
            type: 'parcel_group',
            key,
            value,
            frequency: 1,
            lastUsed: new Date()
        });
    }

    saveFeedbackCache();
}

/**
 * Record a product combination
 * Called when user uses multiple products together
 */
export function recordProductCombo(productNames: string[]): void {
    if (productNames.length < 2) return;

    const sortedNames = productNames.map(n => n.toLowerCase()).sort();
    const key = sortedNames.join('+');
    const id = `product_combo:${key}`;

    const existing = feedbackCache.get(id);
    if (existing) {
        feedbackCache.set(id, {
            ...existing,
            frequency: existing.frequency + 1,
            lastUsed: new Date()
        });
    } else {
        feedbackCache.set(id, {
            id,
            type: 'product_combo',
            key,
            value: sortedNames.join(', '),
            frequency: 1,
            lastUsed: new Date()
        });
    }

    saveFeedbackCache();
}

/**
 * Record a correction pattern
 * Called when user makes a correction
 */
export function recordCorrection(
    correctionType: string,
    target: string | undefined,
    context: string
): void {
    const key = correctionType.toLowerCase();
    const id = `correction:${key}:${Date.now()}`;

    feedbackCache.set(id, {
        id,
        type: 'correction',
        key,
        value: target || 'unknown',
        frequency: 1,
        lastUsed: new Date(),
        metadata: { context }
    });

    // Keep only last 50 corrections
    const corrections = Array.from(feedbackCache.entries())
        .filter(([_, f]) => f.type === 'correction')
        .sort((a, b) => new Date(b[1].lastUsed).getTime() - new Date(a[1].lastUsed).getTime());

    if (corrections.length > 50) {
        for (const [key] of corrections.slice(50)) {
            feedbackCache.delete(key);
        }
    }

    saveFeedbackCache();
}

// ============================================
// Feedback Retrieval Functions
// ============================================

/**
 * Get preferred dosage for a product
 */
export function getPreferredDosage(productName: string): { dosage: number; unit: string } | null {
    const id = `dosage:${productName.toLowerCase()}`;
    const feedback = feedbackCache.get(id);

    if (feedback && feedback.value) {
        const match = feedback.value.match(/^([\d.]+)\s*(.+)$/);
        if (match) {
            return {
                dosage: parseFloat(match[1]),
                unit: match[2]
            };
        }
    }

    return null;
}

/**
 * Get frequently used parcel groups
 */
export function getFrequentParcelGroups(limit: number = 5): Array<{ name: string; frequency: number }> {
    return Array.from(feedbackCache.values())
        .filter(f => f.type === 'parcel_group')
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, limit)
        .map(f => ({ name: f.key, frequency: f.frequency }));
}

/**
 * Get common product combinations
 */
export function getCommonProductCombos(limit: number = 5): Array<{ products: string[]; frequency: number }> {
    return Array.from(feedbackCache.values())
        .filter(f => f.type === 'product_combo')
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, limit)
        .map(f => ({
            products: f.key.split('+'),
            frequency: f.frequency
        }));
}

/**
 * Get dosage suggestions for a product based on history
 */
export function getDosageSuggestions(productName: string): string[] {
    const suggestions: string[] = [];
    const productLower = productName.toLowerCase();

    // First, check for exact match
    const exactMatch = getPreferredDosage(productName);
    if (exactMatch) {
        suggestions.push(`${exactMatch.dosage} ${exactMatch.unit}/ha`);
    }

    // Then check for similar products
    for (const [_, feedback] of feedbackCache) {
        if (feedback.type === 'dosage' && feedback.key.includes(productLower)) {
            const suggestion = `${feedback.value}/ha`;
            if (!suggestions.includes(suggestion)) {
                suggestions.push(suggestion);
            }
        }
    }

    return suggestions.slice(0, 4);
}

/**
 * Get all feedback for debugging/display
 */
export function getAllFeedback(): UserFeedback[] {
    return Array.from(feedbackCache.values());
}

/**
 * Clear all feedback data
 */
export function clearFeedback(): void {
    feedbackCache.clear();
    if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
    }
}

// ============================================
// Punt 6: Supabase Persistence Functions
// ============================================

/**
 * Record feedback to Supabase for cross-device persistence.
 * Uses upsert logic: if same correction exists, increments frequency.
 */
export async function recordFeedbackToSupabase(
    correctionType: FeedbackCorrectionType,
    originalValue: string,
    correctedValue: string,
    context: Record<string, unknown> = {}
): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        // Try to use RPC function if available, otherwise use direct insert/update
        const { data, error } = await withRetry(async () =>
            supabase.rpc('record_smart_input_feedback', {
                p_user_id: userId,
                p_correction_type: correctionType,
                p_original_value: originalValue.toLowerCase().trim(),
                p_corrected_value: correctedValue.trim(),
                p_context: context
            })
        );

        if (error) {
            // Fallback to direct insert if RPC doesn't exist
            if (error.code === '42883') { // function does not exist
                return await recordFeedbackDirect(userId, correctionType, originalValue, correctedValue, context);
            }
            console.error('[FEEDBACK] Error recording to Supabase:', error);
            return { success: false, error: error.message };
        }

        console.log(`[FEEDBACK] Recorded to Supabase: ${correctionType} "${originalValue}" → "${correctedValue}"`);
        return { success: true, feedbackId: data as string };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[FEEDBACK] Exception recording to Supabase:', message);
        return { success: false, error: message };
    }
}

/**
 * Direct insert/update fallback when RPC is not available
 */
async function recordFeedbackDirect(
    userId: string,
    correctionType: FeedbackCorrectionType,
    originalValue: string,
    correctedValue: string,
    context: Record<string, unknown>
): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
    const originalLower = originalValue.toLowerCase().trim();
    const correctedTrimmed = correctedValue.trim();

    // Check if feedback already exists
    const { data: existing } = await supabase
        .from('smart_input_feedback')
        .select('id, frequency')
        .eq('user_id', userId)
        .eq('correction_type', correctionType)
        .eq('original_value', originalLower)
        .eq('corrected_value', correctedTrimmed)
        .single();

    if (existing) {
        // Update frequency
        const { error } = await supabase
            .from('smart_input_feedback')
            .update({
                frequency: existing.frequency + 1,
                last_used_at: new Date().toISOString(),
                context
            })
            .eq('id', existing.id);

        if (error) return { success: false, error: error.message };
        return { success: true, feedbackId: existing.id };
    } else {
        // Insert new
        const { data, error } = await supabase
            .from('smart_input_feedback')
            .insert({
                user_id: userId,
                correction_type: correctionType,
                original_value: originalLower,
                corrected_value: correctedTrimmed,
                context
            })
            .select('id')
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, feedbackId: data?.id };
    }
}

/**
 * Get product alias feedback from Supabase.
 */
export async function getProductAliasFeedbackFromSupabase(): Promise<SmartInputFeedback[]> {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('smart_input_feedback')
            .select('*')
            .eq('user_id', userId)
            .eq('correction_type', 'product_alias')
            .order('frequency', { ascending: false })
            .order('last_used_at', { ascending: false });

        if (error) {
            console.error('[FEEDBACK] Error fetching from Supabase:', error);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            userId: row.user_id,
            correctionType: row.correction_type as FeedbackCorrectionType,
            originalValue: row.original_value,
            correctedValue: row.corrected_value,
            context: row.context || {},
            frequency: row.frequency,
            lastUsedAt: new Date(row.last_used_at),
            createdAt: new Date(row.created_at)
        }));
    } catch (err) {
        console.error('[FEEDBACK] Exception fetching from Supabase:', err);
        return [];
    }
}

/**
 * Get all learned patterns from Supabase for a user.
 * Used to enrich AI context with user-specific patterns.
 */
export async function getUserLearnedPatternsFromSupabase(): Promise<{
    productAliases: Record<string, string>;
    dosageDefaults: Record<string, { dosage: string; unit: string }>;
    exceptionPatterns: Array<{ group: string; exception: string }>;
}> {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { productAliases: {}, dosageDefaults: {}, exceptionPatterns: [] };
        }

        // Fetch all feedback in one query
        const { data, error } = await supabase
            .from('smart_input_feedback')
            .select('*')
            .eq('user_id', userId)
            .in('correction_type', ['product_alias', 'dosage_preference', 'exception_pattern'])
            .gte('frequency', 2) // Only patterns used multiple times
            .order('frequency', { ascending: false });

        if (error) {
            console.error('[FEEDBACK] Error fetching patterns from Supabase:', error);
            return { productAliases: {}, dosageDefaults: {}, exceptionPatterns: [] };
        }

        const productAliases: Record<string, string> = {};
        const dosageDefaults: Record<string, { dosage: string; unit: string }> = {};
        const exceptionPatterns: Array<{ group: string; exception: string }> = [];

        for (const row of data || []) {
            if (row.correction_type === 'product_alias') {
                productAliases[row.original_value] = row.corrected_value;
            } else if (row.correction_type === 'dosage_preference') {
                const match = row.corrected_value.match(/^([\d.]+)\s*(\S+)/);
                if (match && !dosageDefaults[row.original_value]) {
                    dosageDefaults[row.original_value] = { dosage: match[1], unit: match[2] };
                }
            } else if (row.correction_type === 'exception_pattern') {
                exceptionPatterns.push({
                    group: row.original_value,
                    exception: row.corrected_value
                });
            }
        }

        return { productAliases, dosageDefaults, exceptionPatterns };
    } catch (err) {
        console.error('[FEEDBACK] Exception fetching patterns from Supabase:', err);
        return { productAliases: {}, dosageDefaults: {}, exceptionPatterns: [] };
    }
}

// ============================================
// Punt 6: Convenience Recording Functions
// ============================================

/**
 * Record when user corrects a product alias.
 * Saves to both localStorage (fast) and Supabase (persistent).
 */
export async function recordProductAliasCorrection(
    userInput: string,
    correctProduct: string,
    context?: { crop?: string; rawInput?: string }
): Promise<void> {
    // Save to localStorage for immediate use
    const key = userInput.toLowerCase();
    const id = `product_alias:${key}`;
    const existing = feedbackCache.get(id);

    if (existing) {
        feedbackCache.set(id, {
            ...existing,
            value: correctProduct,
            frequency: existing.frequency + 1,
            lastUsed: new Date()
        });
    } else {
        feedbackCache.set(id, {
            id,
            type: 'correction',
            key,
            value: correctProduct,
            frequency: 1,
            lastUsed: new Date()
        });
    }
    saveFeedbackCache();

    // Also save to Supabase for persistence
    await recordFeedbackToSupabase('product_alias', userInput, correctProduct, context || {});
}

/**
 * Record when user changes a dosage.
 * Saves to both localStorage and Supabase.
 */
export async function recordDosageCorrectionAsync(
    productName: string,
    newDosage: number,
    newUnit: string,
    context?: { crop?: string }
): Promise<void> {
    // Save to localStorage
    recordDosagePreference(productName, newDosage, newUnit);

    // Also save to Supabase
    await recordFeedbackToSupabase(
        'dosage_preference',
        productName,
        `${newDosage} ${newUnit}`,
        context || {}
    );
}

/**
 * Record when user removes a parcel from a group (exception pattern).
 */
export async function recordParcelException(
    groupKeyword: string,
    excludedParcelName: string,
    context?: { crop?: string; variety?: string }
): Promise<void> {
    // Save to Supabase (no localStorage equivalent for this)
    await recordFeedbackToSupabase(
        'exception_pattern',
        groupKeyword,
        excludedParcelName,
        context || {}
    );
}

/**
 * Record when user adds a product combination.
 * Saves to both localStorage and Supabase.
 */
export async function recordProductComboAsync(
    primaryProduct: string,
    addedProduct: string
): Promise<void> {
    // Save to localStorage
    recordProductCombo([primaryProduct, addedProduct]);

    // Also save to Supabase
    await recordFeedbackToSupabase(
        'product_combo',
        primaryProduct,
        addedProduct,
        { primaryProduct, addedProduct }
    );
}

/**
 * Apply learned product aliases to input text.
 * Combines localStorage (fast) and Supabase (comprehensive) sources.
 */
export async function applyLearnedAliases(
    productTerms: string[]
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // First check localStorage (fast)
    for (const term of productTerms) {
        const termLower = term.toLowerCase().trim();
        const localId = `product_alias:${termLower}`;
        const local = feedbackCache.get(localId);
        if (local && local.value && local.frequency >= 1) {
            result[termLower] = local.value;
        }
    }

    // Then check Supabase for any missing
    const missingTerms = productTerms.filter(t => !result[t.toLowerCase().trim()]);
    if (missingTerms.length > 0) {
        const supabaseFeedback = await getProductAliasFeedbackFromSupabase();
        for (const term of missingTerms) {
            const termLower = term.toLowerCase().trim();
            const match = supabaseFeedback.find(f => f.originalValue === termLower);
            if (match && match.frequency >= 1) {
                result[termLower] = match.correctedValue;
            }
        }
    }

    return result;
}
