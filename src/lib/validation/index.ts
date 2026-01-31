/**
 * Validation Module Exports
 *
 * AgriBot Hybrid Engine v2.0
 */

// CTGB Engine - Core validation logic
export {
  validateApplication,
  quickValidate,
  parseDosering,
  parseInterval,
  type SprayTask,
  type CtgbValidationResult,
  type ValidationError,
  type ValidationWarning,
  type SubstanceReport,
  type ActiveSubstance,
} from './ctgb-engine';

// Product Matcher - Fuzzy search with trigram similarity
export {
  matchProduct,
  matchProducts,
  getProductSuggestions,
  resolveAlias,
  getAliasesForProduct,
  type ProductMatch,
  type MatchResult,
} from './product-matcher';

// Parcel Filter - Set operations for parcel selection
export {
  applyLocationFilter,
  applyLocationFilterDb,
  describeFilter,
  parseNaturalLocationFilter,
  validateFilter,
  type LocationFilter,
  type FilterResult,
} from './parcel-filter';

// Re-export variety/crop detection utilities
export { KNOWN_VARIETIES, KNOWN_CROPS, isKnownVariety, isKnownCrop } from './parcel-filter';
