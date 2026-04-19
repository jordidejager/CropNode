/**
 * Centrale kleur-mapping voor Veldnotities tags.
 * Hergebruikt het 11-kleurenpalet uit urenregistratie/task-colors.ts
 * zodat badges, map-pins, archief-kaarten, dashboard-widgets én filters
 * overal dezelfde kleur hebben voor dezelfde tag.
 */

import {
  TASK_COLOR_TOKENS,
  tokensFor,
  type TaskColor,
} from '@/lib/urenregistratie/task-colors'

export type FieldNoteTag = 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig'

/** Één bron van waarheid: tag → kleur uit het 11-palette */
export const TAG_TO_COLOR: Record<FieldNoteTag, TaskColor> = {
  bespuiting: 'blue',
  bemesting: 'emerald',
  taak: 'amber',
  waarneming: 'purple',
  overig: 'sky',
}

/** Zichtbaar-label per tag (NL) */
export const TAG_LABEL: Record<FieldNoteTag, string> = {
  bespuiting: 'Bespuiting',
  bemesting: 'Bemesting',
  taak: 'Taak',
  waarneming: 'Waarneming',
  overig: 'Overig',
}

/** Korte uitleg per tag — voor tooltips en empty-states */
export const TAG_DESCRIPTION: Record<FieldNoteTag, string> = {
  bespuiting: 'Gewasbescherming, middelen, dosering',
  bemesting: 'Meststoffen, bladvoeding, bodembemesting',
  taak: 'To-do, reminder, actie die gedaan moet worden',
  waarneming: 'Observatie in het veld (ziekte, plaag, bloei)',
  overig: 'Overige notitie',
}

/** Tag iconen (lucide names) — gebruikt door TagChip/ObservationBadge */
export const TAG_LUCIDE_ICON: Record<FieldNoteTag, 'Droplets' | 'Leaf' | 'ListTodo' | 'Eye' | 'Tag'> = {
  bespuiting: 'Droplets',
  bemesting: 'Leaf',
  taak: 'ListTodo',
  waarneming: 'Eye',
  overig: 'Tag',
}

export function tagColor(tag: FieldNoteTag | null | undefined): TaskColor {
  return tag ? TAG_TO_COLOR[tag] : 'sky'
}

export function tagTokens(tag: FieldNoteTag | null | undefined) {
  return tokensFor(tagColor(tag))
}

export function tagLabel(tag: FieldNoteTag | null | undefined): string {
  return tag ? TAG_LABEL[tag] : 'Overig'
}

export function tagDescription(tag: FieldNoteTag | null | undefined): string {
  return tag ? TAG_DESCRIPTION[tag] : ''
}

/**
 * Observation-category (sub-classificatie binnen 'waarneming').
 */
export type ObservationCategory = 'insect' | 'schimmel' | 'ziekte' | 'fysiologisch' | 'overig'

export const OBSERVATION_CATEGORY_COLOR: Record<ObservationCategory, TaskColor> = {
  insect: 'amber',
  schimmel: 'emerald',
  ziekte: 'orange',
  fysiologisch: 'cyan',
  overig: 'sky',
}

export const OBSERVATION_CATEGORY_LABEL: Record<ObservationCategory, string> = {
  insect: 'Insect',
  schimmel: 'Schimmel',
  ziekte: 'Ziekte',
  fysiologisch: 'Fysiologisch',
  overig: 'Overig',
}

export function observationTokens(cat: ObservationCategory | null | undefined) {
  return tokensFor(cat ? OBSERVATION_CATEGORY_COLOR[cat] : 'amber')
}

/** Re-exports voor convenience */
export { TASK_COLOR_TOKENS, tokensFor }
export type { TaskColor }
