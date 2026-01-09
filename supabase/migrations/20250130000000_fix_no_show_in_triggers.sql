-- Fix remaining references to 'no_show' status in triggers
-- The booking_status enum only has: pending, confirmed, checked_in, completed, cancelled

-- Fix restore_overlapping_slot_capacity function
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
  -- REMOVED 'no_show' as it's not a valid enum value
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed') THEN
    -- Get booking slot details
    SELECT 
      s.slot_date,
      s.start_time,
      s.end_time,
      b.employee_id
    INTO 
      v_booking_slot_date,
      v_booking_start_time,
      v_booking_end_time,
      v_employee_id
    FROM slots s
    JOIN bookings b ON b.slot_id = s.id
    WHERE b.id = NEW.id;

    -- Restore capacity for overlapping slots with same employee
    IF v_employee_id IS NOT NULL THEN
      UPDATE slots
      SET available_capacity = LEAST(original_capacity, available_capacity + OLD.visitor_count)
      WHERE id IN (
        SELECT s2.id
        FROM slots s2
        WHERE s2.employee_id = v_employee_id
          AND s2.slot_date = v_booking_slot_date
          AND (
            (s2.start_time < v_booking_end_time AND s2.end_time > v_booking_start_time)
          )
          AND s2.id != OLD.slot_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure restore_slot_capacity_on_booking doesn't reference 'no_show'
CREATE OR REPLACE FUNCTION restore_slot_capacity_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When booking is cancelled or completed, restore capacity
  -- REMOVED 'no_show' as it's not a valid enum value
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed') THEN
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

