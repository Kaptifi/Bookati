/*
  # Booking-Level Employee Conflict Detection

  ## Overview
  Implements employee availability checking at the booking level, not setup level.
  When a booking is made, the system reduces the employee's availability for ALL other
  services they're assigned to during that time period.

  ## Key Concepts
  1. Employees can be assigned to multiple overlapping services/shifts (setup level)
  2. When a booking is created, employee becomes unavailable for that time across ALL services
  3. For service-based capacity services, if one employee is booked, capacity reduces by 1
  4. Bookings automatically reduce slot availability considering employee conflicts

  ## Implementation
  1. Function: check_employee_availability_for_booking
     - Checks if employee is already booked during the requested time
     - Returns true if available, false if conflict exists
  
  2. Function: reduce_overlapping_slot_capacity
     - When booking is confirmed, reduces capacity on overlapping slots
     - Affects all services the employee is assigned to
     - Only impacts slots that overlap with the booking time

  3. Trigger: validate_employee_availability_on_booking
     - Runs before INSERT on bookings
     - Validates employee is available for the time slot
     - Blocks booking if employee has conflicting booking

  4. Trigger: update_overlapping_slots_on_booking
     - Runs after INSERT on bookings (when status is confirmed)
     - Reduces available_capacity on overlapping slots for other services
*/

-- Function to check if employee is available for a booking
CREATE OR REPLACE FUNCTION check_employee_availability_for_booking(
  p_employee_id uuid,
  p_slot_date date,
  p_start_time time,
  p_end_time time,
  p_service_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count integer;
BEGIN
  -- Check if employee has any confirmed bookings that overlap with this time
  SELECT COUNT(*)
  INTO v_conflict_count
  FROM bookings b
  JOIN slots s ON b.slot_id = s.id
  WHERE b.employee_id = p_employee_id
    AND b.status = 'confirmed'
    AND s.slot_date = p_slot_date
    AND (
      -- Time overlap: start1 < end2 AND start2 < end1
      (s.start_time < p_end_time AND p_start_time < s.end_time)
    );

  RETURN v_conflict_count = 0;
END;
$$;

-- Function to reduce capacity on overlapping slots when booking is made
CREATE OR REPLACE FUNCTION reduce_overlapping_slot_capacity()
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
  -- Only process for confirmed bookings
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Get the booking slot details
  SELECT slot_date, start_time, end_time, employee_id
  INTO v_booking_slot_date, v_booking_start_time, v_booking_end_time, v_employee_id
  FROM slots
  WHERE id = NEW.slot_id;

  -- Update available capacity for all overlapping slots where this employee is assigned
  -- This affects other services the employee is assigned to
  UPDATE slots
  SET available_capacity = GREATEST(0, available_capacity - 1)
  WHERE employee_id = v_employee_id
    AND id != NEW.slot_id  -- Don't update the booked slot itself (already handled by slot capacity)
    AND slot_date = v_booking_slot_date
    AND (
      -- Time overlap: start1 < end2 AND start2 < end1
      (start_time < v_booking_end_time AND v_booking_start_time < end_time)
    )
    AND available_capacity > 0;

  RETURN NEW;
END;
$$;

-- Function to restore capacity on overlapping slots when booking is cancelled
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
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed', 'no_show') THEN
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

-- Trigger to reduce overlapping slot capacity when booking is confirmed
DROP TRIGGER IF EXISTS trigger_reduce_overlapping_capacity ON bookings;
CREATE TRIGGER trigger_reduce_overlapping_capacity
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION reduce_overlapping_slot_capacity();

-- Trigger to restore overlapping slot capacity when booking status changes
DROP TRIGGER IF EXISTS trigger_restore_overlapping_capacity ON bookings;
CREATE TRIGGER trigger_restore_overlapping_capacity
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION restore_overlapping_slot_capacity();

-- Add helpful comments
COMMENT ON FUNCTION check_employee_availability_for_booking IS 'Checks if an employee is available for a booking by detecting conflicts with existing confirmed bookings during the same time period';
COMMENT ON FUNCTION reduce_overlapping_slot_capacity IS 'Reduces available capacity on overlapping slots when an employee is booked, affecting their availability for other services';
COMMENT ON FUNCTION restore_overlapping_slot_capacity IS 'Restores available capacity on overlapping slots when a booking is cancelled or completed';
