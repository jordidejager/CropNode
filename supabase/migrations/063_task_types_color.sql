-- Migration 063: Color column voor task_types
-- Laat telers een kleur kiezen voor elk taaktype.
-- Als NULL: frontend bepaalt deterministische kleur via colorForTaskType().

ALTER TABLE task_types
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL
  CHECK (
    color IS NULL OR color IN (
      'sky', 'amber', 'emerald', 'purple', 'orange',
      'blue', 'teal', 'cyan', 'green', 'lime', 'indigo'
    )
  );
