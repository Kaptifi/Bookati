/*
  # Fix Booking Locks Slot Foreign Key

  This migration fixes the booking_locks table foreign key to point to the correct
  slots table instead of time_slots.

  ## Changes
  - Drop the incorrect foreign key constraint pointing to time_slots
  - Add a new foreign key constraint pointing to the slots table
*/

-- Drop the old foreign key constraint pointing to time_slots
ALTER TABLE booking_locks DROP CONSTRAINT IF EXISTS booking_locks_slot_id_fkey;

-- Add the correct foreign key constraint pointing to slots
ALTER TABLE booking_locks 
  ADD CONSTRAINT booking_locks_slot_id_fkey 
  FOREIGN KEY (slot_id) 
  REFERENCES slots(id)
  ON DELETE CASCADE;
