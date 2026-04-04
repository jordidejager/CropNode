-- Migration 033: Tasks & reminders for field notes
-- Adds deadline, reminder, and reminder-sent tracking

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_reminder_sent BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_field_notes_due_date
  ON field_notes(due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_notes_reminder
  ON field_notes(reminder_at)
  WHERE reminder_at IS NOT NULL AND is_reminder_sent = false;
