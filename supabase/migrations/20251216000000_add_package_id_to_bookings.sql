-- Add package_id column to bookings table
-- This migration adds support for package bookings

-- Add package_id field (nullable, references service_packages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN package_id uuid REFERENCES service_packages(id) ON DELETE SET NULL;
    -- Add index for better query performance
    CREATE INDEX IF NOT EXISTS idx_bookings_package_id ON bookings(package_id) WHERE package_id IS NOT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN bookings.package_id IS 'Package ID if this booking is part of a service package (nullable)';

-- This migration adds support for package bookings

-- Add package_id field (nullable, references service_packages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN package_id uuid REFERENCES service_packages(id) ON DELETE SET NULL;
    -- Add index for better query performance
    CREATE INDEX IF NOT EXISTS idx_bookings_package_id ON bookings(package_id) WHERE package_id IS NOT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN bookings.package_id IS 'Package ID if this booking is part of a service package (nullable)';


