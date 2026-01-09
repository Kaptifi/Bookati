/*
  # Fix Bookings Slot Foreign Key

  This migration fixes a critical database schema issue where the bookings.slot_id
  foreign key was pointing to the wrong table.

  ## Problem
  - bookings.slot_id had a foreign key pointing to time_slots.id
  - However, the application uses the slots table (not time_slots)
  - This caused all booking creations to fail with a foreign key constraint violation

  ## Solution
  - Drop the incorrect foreign key constraint pointing to time_slots
  - Add a new foreign key constraint pointing to the slots table
  - This allows bookings to reference the actual slots being used by the application
*/

-- Drop the old foreign key constraint pointing to time_slots
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_slot_id_fkey;

-- Add the correct foreign key constraint pointing to slots
ALTER TABLE bookings 
  ADD CONSTRAINT bookings_slot_id_fkey 
  FOREIGN KEY (slot_id) 
  REFERENCES slots(id)
  ON DELETE CASCADE;
