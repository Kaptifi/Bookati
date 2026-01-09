-- Add adult_count and child_count columns to bookings table
-- This migration adds separate tracking for adult and child tickets

-- Add adult_count field (defaults to visitor_count for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'adult_count'
  ) THEN
    ALTER TABLE bookings ADD COLUMN adult_count integer;
    -- Set existing visitor_count as adult_count for backward compatibility
    UPDATE bookings SET adult_count = visitor_count WHERE adult_count IS NULL;
    -- Make it NOT NULL after setting values
    ALTER TABLE bookings ALTER COLUMN adult_count SET NOT NULL;
    -- Add check constraint
    ALTER TABLE bookings ADD CONSTRAINT bookings_adult_count_check CHECK (adult_count >= 0);
  END IF;
END $$;

-- Add child_count field (defaults to 0)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'child_count'
  ) THEN
    ALTER TABLE bookings ADD COLUMN child_count integer DEFAULT 0 NOT NULL;
    -- Add check constraint
    ALTER TABLE bookings ADD CONSTRAINT bookings_child_count_check CHECK (child_count >= 0);
  END IF;
END $$;

-- Update visitor_count check to ensure it equals adult_count + child_count
DO $$
BEGIN
  -- Drop existing check if it exists
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_visitor_count_check;
  
  -- Add new check that ensures visitor_count = adult_count + child_count
  ALTER TABLE bookings ADD CONSTRAINT bookings_visitor_count_check 
    CHECK (visitor_count = adult_count + child_count AND visitor_count > 0);
END $$;

-- Add comments for documentation
COMMENT ON COLUMN bookings.adult_count IS 'Number of adult tickets in this booking';
COMMENT ON COLUMN bookings.child_count IS 'Number of child tickets in this booking';



