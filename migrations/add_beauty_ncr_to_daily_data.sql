-- Add beauty_ncr to daily_data so the daily path can calculate Beauty NCR %
-- Run once in the Supabase SQL Editor.
-- Existing rows default to 0 — will be correct after re-uploading daily XLSX files.

ALTER TABLE daily_data
  ADD COLUMN IF NOT EXISTS beauty_ncr integer DEFAULT 0;
