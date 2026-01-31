/**
 * Feedback Service (Fase 3.1.5)
 *
 * Learns from user corrections and preferences to improve future suggestions.
 * Tracks:
 * - Preferred dosages per product
 * - Common parcel groupings
 * - Product combinations
 * - Correction patterns
 */

import type { UserFeedback } from './types';

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
