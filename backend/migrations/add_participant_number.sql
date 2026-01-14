-- Migration: Add participant_number, display_name columns and make user_id nullable
-- 
-- This migration:
-- 1. Adds participant_number column (unique, global counter)
-- 2. Adds display_name column (for manual participants)
-- 3. Makes user_id nullable (for manual participants)
-- 4. Assigns numbers to existing participants based on joined_at

-- Step 1: Add new columns
ALTER TABLE game_participants 
ADD COLUMN participant_number INTEGER,
ADD COLUMN display_name VARCHAR(50);

-- Step 2: Assign sequential numbers to existing participants (ordered by joined_at)
WITH numbered_participants AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at ASC) as row_num
  FROM game_participants
)
UPDATE game_participants gp
SET participant_number = np.row_num
FROM numbered_participants np
WHERE gp.id = np.id;

-- Step 3: Make participant_number NOT NULL and UNIQUE after backfilling
ALTER TABLE game_participants
ALTER COLUMN participant_number SET NOT NULL,
ADD CONSTRAINT game_participants_participant_number_unique UNIQUE (participant_number);

-- Step 4: Make user_id nullable
ALTER TABLE game_participants
ALTER COLUMN user_id DROP NOT NULL;

-- Optional: Add index for faster queries
CREATE INDEX idx_game_participants_participant_number ON game_participants(participant_number);
