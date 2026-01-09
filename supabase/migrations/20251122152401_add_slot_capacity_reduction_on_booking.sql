/*
  # Slot Capacity Reduction on Booking

  ## Overview
  Automatically reduces slot capacity when a booking is made and restores it when cancelled.
  This works in conjunction with the employee conflict detection system.

  ## Implementation
  1. When booking is created/confirmed: Reduce slot's available_capacity
  2. When booking is cancelled/completed: Restore slot's available_capacity
  3. Handles visitor_count to support multi-visitor bookings
*/

-- Function to reduce slot capacity when booking is confirmed
CREATE OR REPLACE FUNCTION reduce_slot_capacity_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process for confirmed bookings
  IF NEW.status = 'confirmed' THEN
    -- Reduce the slot's available capacity and increment booked_count
    UPDATE slots
    SET 
      available_capacity = GREATEST(0, available_capacity - NEW.visitor_count),
      booked_count = booked_count + NEW.visitor_count
    WHERE id = NEW.slot_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to restore slot capacity when booking status changes
CREATE OR REPLACE FUNCTION restore_slot_capacity_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When booking is cancelled or completed, restore capacity
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed', 'no_show') THEN
    UPDATE slots
    SET 
      available_capacity = LEAST(original_capacity, available_capacity + OLD.visitor_count),
      booked_count = GREATEST(0, booked_count - OLD.visitor_count)
    WHERE id = OLD.slot_id;
  END IF;

  -- When booking changes from pending to confirmed, reduce capacity
  IF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
    UPDATE slots
    SET 
      available_capacity = GREATEST(0, available_capacity - NEW.visitor_count),
      booked_count = booked_count + NEW.visitor_count
    WHERE id = NEW.slot_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to reduce slot capacity on new booking
DROP TRIGGER IF EXISTS trigger_reduce_slot_capacity_on_insert ON bookings;
CREATE TRIGGER trigger_reduce_slot_capacity_on_insert
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION reduce_slot_capacity_on_booking();

-- Trigger to manage slot capacity on booking status change
DROP TRIGGER IF EXISTS trigger_manage_slot_capacity_on_update ON bookings;
CREATE TRIGGER trigger_manage_slot_capacity_on_update
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION restore_slot_capacity_on_booking();

COMMENT ON FUNCTION reduce_slot_capacity_on_booking IS 'Reduces slot available_capacity when a booking is confirmed';
COMMENT ON FUNCTION restore_slot_capacity_on_booking IS 'Manages slot capacity when booking status changes between confirmed, cancelled, completed, or no_show';
