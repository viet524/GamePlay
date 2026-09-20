-- Migration 003: Add persisted guess result and background music URL to GameState
-- Run this in your Supabase SQL Editor to add the new columns.

ALTER TABLE "GameState"
  ADD COLUMN IF NOT EXISTS has_guessed_correctly BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guessed_name          TEXT,
  ADD COLUMN IF NOT EXISTS bg_music_url          TEXT;
