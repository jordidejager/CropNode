# Crop Care (Gewasbescherming)

Crop protection management: spray registrations, CTGB product database, fertilizers, and inventory tracking.

## Two-Stage Logging

1. **Logbook (draft)**: AI-parsed entries go through validation. Status flow: `Nieuw → Analyseren... → Te Controleren/Waarschuwing → Akkoord` (or `Fout`/`Afgekeurd`)
2. **Spuitschrift (final)**: Confirmed, immutable compliance records. Confirmation also creates `parcel_history` entries and `inventory_movements`.

## CTGB Validation (6 Priority Checks)

All deterministic — no AI. Pure TypeScript logic in `ctgb-validator.ts`:

1. **Crop authorization** — product must be licensed for the crop
2. **Dosage** — within allowed limits
3. **Application interval** — minimum days between applications
4. **Seasonal maximum** — max applications per growing cycle
5. **Substance cumulation** — limit on applications with same active substance
6. **Safety period (VGT)** — minimum days before harvest

**Crop hierarchy matching**: "pitvruchten" automatically matches both "appel" and "peer". See `CROP_HIERARCHY` in validator.

## Validation Flags

- `error` → status "Afgekeurd" (rejected)
- `warning` → status "Waarschuwing"
- `info` → status "Akkoord" (approved)

## Inventory

```
Current stock = Sum(deliveries) - Sum(confirmed sprays)
```

Deleting a spuitschrift automatically reverses inventory movements.

## Product vs Fertilizer

- **Gewasbeschermingsmiddelen**: CTGB-regulated, 6-step validation, crop-specific, mandatory logging
- **Meststoffen**: Not regulated, no validation, generic nutrients, optional logging

## Product Alias Resolution

User input → `product_aliases` table → official CTGB product name. Aliases track usage count and confidence score.
