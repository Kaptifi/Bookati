-- Add qr_scanned and qr_scanned_at columns to bookings table
-- This migration adds QR code scanning tracking

-- Add qr_scanned field (defaults to false)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'qr_scanned'
  ) THEN
    ALTER TABLE bookings ADD COLUMN qr_scanned boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add qr_scanned_at field (timestamp when QR was scanned)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'qr_scanned_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN qr_scanned_at timestamptz;
  END IF;
END $$;

-- Add qr_scanned_by_user_id field (who scanned the QR)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'qr_scanned_by_user_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN qr_scanned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN bookings.qr_scanned IS 'Whether the QR code has been scanned (invalidates QR)';
COMMENT ON COLUMN bookings.qr_scanned_at IS 'Timestamp when QR code was scanned';
COMMENT ON COLUMN bookings.qr_scanned_by_user_id IS 'User ID who scanned the QR code (cashier/receptionist)';



