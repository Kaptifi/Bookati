-- Add Zoho invoice tracking columns to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS zoho_invoice_id text,
ADD COLUMN IF NOT EXISTS zoho_invoice_created_at timestamptz;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_zoho_invoice_id ON bookings(zoho_invoice_id) WHERE zoho_invoice_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN bookings.zoho_invoice_id IS 'Zoho Invoice ID after receipt is generated';
COMMENT ON COLUMN bookings.zoho_invoice_created_at IS 'Timestamp when Zoho invoice was created';

