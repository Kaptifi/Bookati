/*
  # Add language column to bookings table

  ## Overview
  Adds language column to bookings table to store the customer's preferred language.
  This ensures tickets, emails, and notifications are generated in the correct language.

  ## Changes
  - Add `language` column (text, default 'en', check constraint for 'en' or 'ar')
  - Add index for faster queries
*/

-- Add language column to bookings table
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en' NOT NULL 
  CHECK (language IN ('en', 'ar'));

-- Add index for faster language-based queries
CREATE INDEX IF NOT EXISTS idx_bookings_language ON bookings(language);

-- Add comment
COMMENT ON COLUMN bookings.language IS 'Customer preferred language for ticket generation and communications. Values: en (English) or ar (Arabic).';

