/*
  # Employee Double-Booking Prevention

  ## Overview
  Prevents employees from being assigned to multiple services with overlapping shift schedules.
  This ensures capacity calculations are accurate and employees are not double-counted.

  ## Changes

  1. New Function: check_employee_shift_overlap
    - Detects if an employee is already assigned to a shift that overlaps with the new assignment
    - Checks both time ranges and days of week

  2. New Trigger: prevent_employee_double_booking
    - Blocks insert of employee_services record if shift overlap detected
    - Returns descriptive error message

  3. Validation Logic
    - Compares shift times (start_time_utc, end_time_utc)
    - Checks days_of_week array intersection
    - Allows same employee on non-overlapping shifts

  ## Critical Fix #4 Applied
  Prevents capacity overestimation from double-counting employees across overlapping shifts.
*/

-- Function to check if employee has overlapping shift assignments
CREATE OR REPLACE FUNCTION check_employee_shift_overlap(
  p_employee_id uuid,
  p_service_id uuid,
  p_shift_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_shift_start time;
  v_new_shift_end time;
  v_new_shift_days integer[];
  v_overlap_count integer;
BEGIN
  -- Get the shift details for the new assignment
  SELECT start_time_utc, end_time_utc, days_of_week
  INTO v_new_shift_start, v_new_shift_end, v_new_shift_days
  FROM shifts
  WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check for existing assignments with overlapping shifts
  -- An overlap occurs when:
  -- 1. Time ranges overlap (start1 < end2 AND start2 < end1)
  -- 2. Days of week have at least one common day
  SELECT COUNT(*)
  INTO v_overlap_count
  FROM employee_services es
  JOIN shifts s ON es.shift_id = s.id
  WHERE es.employee_id = p_employee_id
    AND es.service_id != p_service_id  -- Different service
    AND (
      -- Check time overlap: shifts overlap if start1 < end2 AND start2 < end1
      (s.start_time_utc < v_new_shift_end AND v_new_shift_start < s.end_time_utc)
      AND
      -- Check if days of week arrays have any intersection
      (s.days_of_week && v_new_shift_days)  -- && is the array overlap operator
    );

  RETURN v_overlap_count > 0;
END;
$$;

-- Trigger function to prevent employee double-booking
CREATE OR REPLACE FUNCTION prevent_employee_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_overlap boolean;
  v_conflicting_service text;
  v_shift_info text;
BEGIN
  -- Check if there's an overlap
  v_has_overlap := check_employee_shift_overlap(
    NEW.employee_id,
    NEW.service_id,
    NEW.shift_id
  );

  IF v_has_overlap THEN
    -- Get details of conflicting assignment for error message
    SELECT 
      srv.name || ' (' || 
      to_char(s.start_time_utc, 'HH24:MI') || '-' || 
      to_char(s.end_time_utc, 'HH24:MI') || ')'
    INTO v_conflicting_service
    FROM employee_services es
    JOIN services srv ON es.service_id = srv.id
    JOIN shifts s ON es.shift_id = s.id
    WHERE es.employee_id = NEW.employee_id
      AND es.service_id != NEW.service_id
    LIMIT 1;

    RAISE EXCEPTION 'Employee is already assigned to an overlapping shift in service: %. Cannot assign to multiple services with overlapping schedules.', v_conflicting_service
      USING HINT = 'Remove the existing assignment or choose a different shift time.';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on employee_services table
DROP TRIGGER IF EXISTS trigger_prevent_employee_double_booking ON employee_services;
CREATE TRIGGER trigger_prevent_employee_double_booking
  BEFORE INSERT ON employee_services
  FOR EACH ROW
  EXECUTE FUNCTION prevent_employee_double_booking();

-- Add index to improve overlap detection performance
CREATE INDEX IF NOT EXISTS idx_employee_services_employee_shift 
  ON employee_services(employee_id, shift_id);

-- Add helpful comment
COMMENT ON FUNCTION check_employee_shift_overlap IS 'Checks if an employee has overlapping shift assignments across different services to prevent double-booking and capacity overestimation';
