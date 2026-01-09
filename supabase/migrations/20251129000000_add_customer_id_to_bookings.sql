/*
  # Add customer_id to bookings table

  ## Overview
  Adds customer_id column to bookings table to link bookings to customer user accounts.
  This allows customers to see their bookings in their dashboard.

  ## Changes
  - Add `customer_id` column (uuid, nullable, foreign key to users table)
  - Add index for faster queries
*/

-- Add customer_id column to bookings table
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Add index for faster customer booking queries
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);

-- Add comment
COMMENT ON COLUMN bookings.customer_id IS 'References the user account of the customer who made this booking. NULL for guest bookings.';







