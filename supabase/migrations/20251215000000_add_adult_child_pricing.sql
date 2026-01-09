-- Add adult_price and child_price columns to services table
-- This migration adds separate pricing for adult and child tickets

-- Add adult_price field (defaults to base_price for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'adult_price'
  ) THEN
    ALTER TABLE services ADD COLUMN adult_price numeric(10, 2);
    -- Set existing base_price as adult_price for backward compatibility
    UPDATE services SET adult_price = base_price WHERE adult_price IS NULL;
    -- Make it NOT NULL after setting values
    ALTER TABLE services ALTER COLUMN adult_price SET NOT NULL;
  END IF;
END $$;

-- Add child_price field (optional, can be NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'child_price'
  ) THEN
    ALTER TABLE services ADD COLUMN child_price numeric(10, 2);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN services.adult_price IS 'Price for adult tickets (replaces base_price for new bookings)';
COMMENT ON COLUMN services.child_price IS 'Price for child tickets (optional, if NULL, child tickets use adult_price)';



