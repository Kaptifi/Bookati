-- Add discount pricing fields to services table
-- This migration adds original_price and discount_percentage columns

-- Add original_price field for discount pricing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'original_price'
  ) THEN
    ALTER TABLE services ADD COLUMN original_price numeric(10, 2);
  END IF;
END $$;

-- Add discount_percentage field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'discount_percentage'
  ) THEN
    ALTER TABLE services ADD COLUMN discount_percentage integer;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN services.original_price IS 'Original price before discount';
COMMENT ON COLUMN services.discount_percentage IS 'Discount percentage (0-100)';






















