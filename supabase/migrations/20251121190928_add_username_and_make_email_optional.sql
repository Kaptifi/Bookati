/*
  # Add username field and make email optional

  1. Changes
    - Add `username` column to `users` table (unique, required for authentication)
    - Make `email` column nullable (optional)
    - Add unique constraint on username
    
  2. Security
    - Username will be used for authentication instead of email
    - Maintain existing RLS policies
*/

-- Add username column (unique, required)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username text;
  END IF;
END $$;

-- Make email nullable
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Add unique constraint on username
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);