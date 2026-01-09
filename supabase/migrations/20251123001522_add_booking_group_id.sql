/*
  # Add Booking Group ID

  ## Changes
  - Adds `booking_group_id` to the bookings table to link related bookings together
  - When a customer books multiple slots (quantity > 1), all bookings in that transaction will share the same booking_group_id
  - This allows proper grouping and display of multi-slot bookings
  
  ## Technical Details
  - `booking_group_id`: UUID field that groups related bookings
  - Defaults to the booking's own ID for single bookings (no group)
  - For multi-slot bookings, all bookings share the same group ID
*/

-- Add booking_group_id column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_id uuid;

-- For existing bookings without a group, set booking_group_id to their own ID
UPDATE bookings SET booking_group_id = id WHERE booking_group_id IS NULL;

-- Add index for faster grouping queries
CREATE INDEX IF NOT EXISTS idx_bookings_group_id ON bookings(booking_group_id);