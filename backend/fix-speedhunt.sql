-- Fix speedhunt_sessions table to allow virtual hunter IDs
ALTER TABLE speedhunt_sessions DROP CONSTRAINT "FK_speedhunt_sessions_hunter";
ALTER TABLE speedhunt_sessions ALTER COLUMN hunter_participant_id TYPE VARCHAR(255);
