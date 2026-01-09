/*
  # Fix Slot Generation with Fallback Logic

  1. Changes
    - Drops and recreates the `generate_slots_for_shift` function with fallback logic
    - Priority 1: Use employees explicitly assigned to the shift
    - Priority 2: Use employees assigned to the service (without specific shift)
    - Priority 3: Use all active employees for the tenant
    
  2. Benefits
    - New services work immediately without manual employee assignment
    - More flexible slot generation
    - Better user experience for tenant admins
    - Maintains backward compatibility with explicitly assigned employees
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS generate_slots_for_shift(uuid, date, date);

-- Recreate with the new logic
CREATE OR REPLACE FUNCTION generate_slots_for_shift(
  p_shift_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_service_id uuid;
  v_start_time_utc time;
  v_end_time_utc time;
  v_days_of_week integer[];
  v_duration_minutes integer;
  v_capacity_per_slot integer;
  v_employee_id uuid;
  v_current_date date;
  v_slot_start_minutes integer;
  v_slot_end_minutes integer;
  v_shift_start_minutes integer;
  v_shift_end_minutes integer;
  v_slots_generated integer := 0;
  v_start_time time;
  v_end_time time;
  v_start_timestamp timestamptz;
  v_end_timestamp timestamptz;
  v_employees_count integer;
BEGIN
  -- Get shift and service details
  SELECT
    sh.tenant_id,
    sh.service_id,
    sh.start_time_utc,
    sh.end_time_utc,
    sh.days_of_week,
    srv.duration_minutes,
    srv.capacity_per_slot
  INTO
    v_tenant_id,
    v_service_id,
    v_start_time_utc,
    v_end_time_utc,
    v_days_of_week,
    v_duration_minutes,
    v_capacity_per_slot
  FROM shifts sh
  JOIN services srv ON sh.service_id = srv.id
  WHERE sh.id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  -- Delete existing slots for this shift in the date range
  DELETE FROM slots
  WHERE shift_id = p_shift_id
    AND slot_date >= p_start_date
    AND slot_date <= p_end_date;

  -- Calculate shift time in minutes
  v_shift_start_minutes := EXTRACT(HOUR FROM v_start_time_utc) * 60 +
                           EXTRACT(MINUTE FROM v_start_time_utc);
  v_shift_end_minutes := EXTRACT(HOUR FROM v_end_time_utc) * 60 +
                         EXTRACT(MINUTE FROM v_end_time_utc);

  -- Check if there are employees explicitly assigned to this shift
  SELECT COUNT(*) INTO v_employees_count
  FROM employee_services
  WHERE shift_id = p_shift_id;

  -- Loop through each date in range
  v_current_date := p_start_date;
  WHILE v_current_date <= p_end_date LOOP
    -- Check if this day of week is in shift's days_of_week
    IF EXTRACT(DOW FROM v_current_date)::integer = ANY(v_days_of_week) THEN

      -- Loop through employees based on availability
      FOR v_employee_id IN
        (
          -- Priority 1: Employees explicitly assigned to this shift
          SELECT DISTINCT employee_id
          FROM employee_services
          WHERE shift_id = p_shift_id

          UNION

          -- Priority 2: If no shift assignments, use employees assigned to the service (without shift)
          SELECT DISTINCT employee_id
          FROM employee_services
          WHERE service_id = v_service_id
            AND shift_id IS NULL
            AND v_employees_count = 0

          UNION

          -- Priority 3: If no service assignments at all, use all active employees for the tenant
          SELECT DISTINCT id
          FROM users
          WHERE tenant_id = v_tenant_id
            AND role = 'employee'
            AND is_active = true
            AND v_employees_count = 0
            AND NOT EXISTS (
              SELECT 1 FROM employee_services WHERE service_id = v_service_id
            )
        )
      LOOP

        -- Generate slots for this employee on this date
        v_slot_start_minutes := v_shift_start_minutes;

        WHILE v_slot_start_minutes + v_duration_minutes <= v_shift_end_minutes LOOP
          v_slot_end_minutes := v_slot_start_minutes + v_duration_minutes;

          -- Convert minutes to time
          v_start_time := make_time(
            v_slot_start_minutes / 60,
            v_slot_start_minutes % 60,
            0
          );
          v_end_time := make_time(
            v_slot_end_minutes / 60,
            v_slot_end_minutes % 60,
            0
          );

          -- Create timestamps
          v_start_timestamp := v_current_date + v_start_time;
          v_end_timestamp := v_current_date + v_end_time;

          -- Insert slot
          INSERT INTO slots (
            tenant_id,
            shift_id,
            employee_id,
            slot_date,
            start_time,
            end_time,
            start_time_utc,
            end_time_utc,
            available_capacity,
            booked_count,
            is_available
          ) VALUES (
            v_tenant_id,
            p_shift_id,
            v_employee_id,
            v_current_date,
            v_start_time,
            v_end_time,
            v_start_timestamp,
            v_end_timestamp,
            v_capacity_per_slot,
            0,
            true
          );

          v_slots_generated := v_slots_generated + 1;
          v_slot_start_minutes := v_slot_start_minutes + v_duration_minutes;
        END LOOP;

      END LOOP;

    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_slots_generated;
END;
$$;