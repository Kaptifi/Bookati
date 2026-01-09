/*
  # Fix Booking Status Enum Values

  ## Overview
  Updates the capacity management functions to use correct booking_status enum values.
  The enum has: pending, confirmed, checked_in, completed, cancelled (no 'no_show')

  ## Changes
  - Update restore_slot_capacity_on_booking to use correct enum values
  - Update restore_overlapping_slot_capacity to use correct enum values
*/

-- Fix the slot capacity restoration function
CREATE OR REPLACE FUNCTION restore_slot_capacity_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When booking is cancelled or completed, restore capacity
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed') THEN
    UPDATE slots
    SET available_capacity = LEAST(original_capacity, available_capacity + OLD.visitor_count)
    WHERE id = OLD.slot_id;
  END IF;

  -- When booking changes from pending to confirmed, reduce capacity
  IF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
    UPDATE slots
    SET available_capacity = GREATEST(0, available_capacity - NEW.visitor_count)
    WHERE id = NEW.slot_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the overlapping capacity restoration function
CREATE OR REPLACE FUNCTION restore_overlapping_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_slot_date date;
  v_booking_start_time time;
  v_booking_end_time time;
  v_employee_id uuid;
BEGIN
  -- Only process when status changes from confirmed to cancelled/completed
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed') THEN
    -- Get the booking slot details
    SELECT slot_date, start_time, end_time, employee_id
    INTO v_booking_slot_date, v_booking_start_time, v_booking_end_time, v_employee_id
    FROM slots
    WHERE id = OLD.slot_id;

    -- Restore available capacity for overlapping slots
    UPDATE slots
    SET available_capacity = LEAST(original_capacity, available_capacity + 1)
    WHERE employee_id = v_employee_id
      AND id != OLD.slot_id
      AND slot_date = v_booking_slot_date
      AND (
        -- Time overlap
        (start_time < v_booking_end_time AND v_booking_start_time < end_time)
      )
      AND available_capacity < original_capacity;
  END IF;

  RETURN NEW;
END;
$$;
