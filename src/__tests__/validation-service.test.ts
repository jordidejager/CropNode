/**
 * Unit tests for CTGB validation logic.
 *
 * Tests pure functions in validation-service.ts and harvest-year-utils.ts.
 * These are the core compliance functions — correctness is critical.
 *
 * Run: npm run test:validation
 */

import assert from 'node:assert';
import {
  getCurrentSeason,
  isCropAllowed,
  parseDosering,
  parseInterval,
} from '../lib/validation-service';
import {
  suggestHarvestYear,
  getHarvestYearOptions,
  formatHarvestYear,
} from '../lib/analytics/harvest-year-utils';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    failed++;
    const msg = `  ✗ ${name}: ${error.message}`;
    console.error(msg);
    errors.push(msg);
  }
}

function describe(section: string, fn: () => void) {
  console.log(`\n${section}`);
  fn();
}

// ============================================
// parseDosering
// ============================================

describe('parseDosering', () => {
  test('parses simple liter dosage', () => {
    const result = parseDosering('1.5 l/ha');
    assert.ok(result, 'Expected non-null result');
    assert.strictEqual(result.value, 1.5);
    assert.strictEqual(result.unit, 'l');
  });

  test('parses range — takes maximum', () => {
    const result = parseDosering('0.5-1.0 l/ha');
    assert.ok(result);
    assert.strictEqual(result.value, 1.0);
    assert.strictEqual(result.unit, 'l');
  });

  test('handles Dutch comma decimal', () => {
    const result = parseDosering('1,5 l/ha');
    assert.ok(result);
    assert.strictEqual(result.value, 1.5);
  });

  test('parses kg unit', () => {
    const result = parseDosering('2 kg/ha');
    assert.ok(result);
    assert.strictEqual(result.value, 2);
    assert.strictEqual(result.unit, 'kg');
  });

  test('parses ml unit', () => {
    const result = parseDosering('500 ml/ha');
    assert.ok(result);
    assert.strictEqual(result.value, 500);
    assert.strictEqual(result.unit, 'ml');
  });

  test('parses g unit', () => {
    const result = parseDosering('250 g/ha');
    assert.ok(result);
    assert.strictEqual(result.value, 250);
    assert.strictEqual(result.unit, 'g');
  });

  test('returns null for invalid input', () => {
    assert.strictEqual(parseDosering('xyz'), null);
  });

  test('returns null for empty string', () => {
    assert.strictEqual(parseDosering(''), null);
  });

  test('handles range with Dutch decimals', () => {
    const result = parseDosering('0,5-1,0 l');
    assert.ok(result);
    assert.strictEqual(result.value, 1.0);
  });
});

// ============================================
// parseInterval
// ============================================

describe('parseInterval', () => {
  test('parses days with min prefix', () => {
    assert.strictEqual(parseInterval('min. 7 dagen'), 7);
  });

  test('parses days without prefix', () => {
    assert.strictEqual(parseInterval('10 dagen'), 10);
  });

  test('parses weeks to days', () => {
    assert.strictEqual(parseInterval('2 weken'), 14);
  });

  test('parses 1 week', () => {
    assert.strictEqual(parseInterval('1 week'), 7);
  });

  test('returns null for invalid', () => {
    assert.strictEqual(parseInterval('xyz'), null);
  });

  test('returns null for empty string', () => {
    assert.strictEqual(parseInterval(''), null);
  });
});

// ============================================
// isCropAllowed
// ============================================

describe('isCropAllowed', () => {
  test('direct match — exact', () => {
    assert.strictEqual(isCropAllowed('Appel', 'appel'), true);
  });

  test('direct match — case insensitive', () => {
    assert.strictEqual(isCropAllowed('APPEL', 'appel, peren'), true);
  });

  test('hierarchy match — appel in pitvruchten', () => {
    assert.strictEqual(isCropAllowed('Appel', 'pitvruchten'), true);
  });

  test('hierarchy match — peer in pitvruchten', () => {
    assert.strictEqual(isCropAllowed('Peer', 'pitvruchten'), true);
  });

  test('no match — wrong crop', () => {
    assert.strictEqual(isCropAllowed('Tomaat', 'appel, peren'), false);
  });

  test('comma-separated list', () => {
    assert.strictEqual(isCropAllowed('Peer', 'appel, peer, kers'), true);
  });
});

// ============================================
// getCurrentSeason
// ============================================

describe('getCurrentSeason', () => {
  test('returns January 1 as start', () => {
    const season = getCurrentSeason(new Date(2026, 5, 15));
    assert.strictEqual(season.start.getFullYear(), 2026);
    assert.strictEqual(season.start.getMonth(), 0);
    assert.strictEqual(season.start.getDate(), 1);
  });

  test('returns December 31 as end', () => {
    const season = getCurrentSeason(new Date(2026, 5, 15));
    assert.strictEqual(season.end.getFullYear(), 2026);
    assert.strictEqual(season.end.getMonth(), 11);
    assert.strictEqual(season.end.getDate(), 31);
  });

  test('works for different years', () => {
    const season2025 = getCurrentSeason(new Date(2025, 0, 1));
    assert.strictEqual(season2025.start.getFullYear(), 2025);

    const season2027 = getCurrentSeason(new Date(2027, 11, 31));
    assert.strictEqual(season2027.end.getFullYear(), 2027);
  });
});

// ============================================
// suggestHarvestYear
// ============================================

describe('suggestHarvestYear', () => {
  test('January → current year', () => {
    assert.strictEqual(suggestHarvestYear(new Date(2026, 0, 15)), 2026);
  });

  test('October → current year', () => {
    assert.strictEqual(suggestHarvestYear(new Date(2026, 9, 31)), 2026);
  });

  test('November → next year', () => {
    assert.strictEqual(suggestHarvestYear(new Date(2026, 10, 1)), 2027);
  });

  test('December → next year', () => {
    assert.strictEqual(suggestHarvestYear(new Date(2026, 11, 31)), 2027);
  });

  test('November 2025 → 2026', () => {
    assert.strictEqual(suggestHarvestYear(new Date(2025, 10, 1)), 2026);
  });
});

// ============================================
// getHarvestYearOptions
// ============================================

describe('getHarvestYearOptions', () => {
  test('deduplicates and sorts descending', () => {
    const result = getHarvestYearOptions([2026, 2025, 2026, 2024]);
    assert.deepStrictEqual(result, [2026, 2025, 2024]);
  });

  test('single value', () => {
    assert.deepStrictEqual(getHarvestYearOptions([2025]), [2025]);
  });

  test('empty array', () => {
    assert.deepStrictEqual(getHarvestYearOptions([]), []);
  });
});

// ============================================
// formatHarvestYear
// ============================================

describe('formatHarvestYear', () => {
  test('formats correctly', () => {
    assert.strictEqual(formatHarvestYear(2026), 'Oogst 2026');
  });

  test('formats different year', () => {
    assert.strictEqual(formatHarvestYear(2025), 'Oogst 2025');
  });
});

// ============================================
// Results
// ============================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.log(`\nFailed tests:`);
  errors.forEach(e => console.log(e));
}
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
