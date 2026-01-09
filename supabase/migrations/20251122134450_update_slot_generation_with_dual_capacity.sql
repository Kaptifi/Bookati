/*
  # Update Slot Generation Function for Dual Capacity Model

  ## Overview
  Updates the generate_slots_for_shift function to support both capacity modes:
  - Employee-Based: Calculates capacity from assigned employees
  - Service-Based: Uses fixed service capacity

  ## Changes

  1. Shift-Duration Validation
    - Ensures shift duration can accommodate at least one service slot
    - Prevents partial slot generation at shift end

  2. Capacity Calculation Based on Mode
    - Employee-Based: Queries employee_services and sums capacity_per_slot from users
    - Service-Based: Uses service.service_capacity_per_slot directly

  3. Employee Validation
    - For employee_based mode, requires at least one employee assigned to shift

  4. Slot Generation Logic
    - Uses service_duration_minutes for all modes
    - Stores capacity in both available_capacity and original_capacity
    - Only generates complete slots (no partial slots at shift end)

  ## Critical Fixes Applied
  - Fix 1: Uses service_duration_minutes for both modes
  - Fix 3: Validates shift-duration compatibility
  - Fix 4: Employee overlap prevention (via trigger from previous migration)
*/

-- Drop the old function
DROP FUNCTION IF EXISTS generate_slots_for_shift(uuid, date, date);

-- Create updated function with dual capacity support
CREATE OR REPLACE FUNCTION generate_slots_for_shift(
  p_shift_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_service_id uuid;
  v_start_time_utc time;
  v_end_time_utc time;
  v_days_of_week integer[];
  v_service_duration_minutes integer;
  v_capacity_mode capacity_mode;
  v_service_capacity integer;
  v_current_date date;
  v_slot_start_minutes integer;
  v_slot_end_minutes integer;
  v_shift_start_minutes integer;
  v_shift_end_minutes integer;
  v_shift_duration_minutes integer;
  v_slots_generated integer := 0;
  v_start_time time;
  v_end_time time;
  v_start_timestamp timestamptz;
  v_end_timestamp timestamptz;
  v_employee_id uuid;
  v_slot_capacity integer;
  v_employees_count integer;
  v_result jsonb;
BEGIN
  -- Get shift and service details including capacity mode
  SELECT 
    sh.tenant_id,
    sh.service_id,
    sh.start_time_utc,
    sh.end_time_utc,
    sh.days_of_week,
    srv.service_duration_minutes,
    srv.capacity_mode,
    srv.service_capacity_per_slot
  INTO 
    v_tenant_id,
    v_service_id,
    v_start_time_utc,
    v_end_time_utc,
    v_days_of_week,
    v_service_duration_minutes,
    v_capacity_mode,
    v_service_capacity
  FROM shifts sh
  JOIN services srv ON sh.service_id = srv.id
  WHERE sh.id = p_shift_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Shift not found',
      'slots_generated', 0
    );
  END IF;

  -- Calculate shift duration in minutes
  v_shift_start_minutes := EXTRACT(HOUR FROM v_start_time_utc) * 60 + 
                           EXTRACT(MINUTE FROM v_start_time_utc);
  v_shift_end_minutes := EXTRACT(HOUR FROM v_end_time_utc) * 60 + 
                         EXTRACT(MINUTE FROM v_end_time_utc);
  v_shift_duration_minutes := v_shift_end_minutes - v_shift_start_minutes;

  -- Validate: shift must accommodate at least one complete service slot (Fix #3)
  IF v_shift_duration_minutes < v_service_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Shift duration (%s minutes) is shorter than service duration (%s minutes)', 
                      v_shift_duration_minutes, v_service_duration_minutes),
      'slots_generated', 0
    );
  END IF;

  -- Calculate capacity based on mode
  IF v_capacity_mode = 'employee_based' THEN
    -- For employee-based: sum capacity from all assigned employees
    SELECT 
      COALESCE(SUM(u.capacity_per_slot), 0),
      COUNT(*)
    INTO v_slot_capacity, v_employees_count
    FROM employee_services es
    JOIN users u ON es.employee_id = u.id
    WHERE es.shift_id = p_shift_id;

    -- Validate: at least one employee must be assigned
    IF v_employees_count = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'No employees assigned to this shift for employee-based service',
        'slots_generated', 0
      );
    END IF;

    IF v_slot_capacity = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Total employee capacity is zero',
        'slots_generated', 0
      );
    END IF;
  ELSE
    -- For service-based: use fixed service capacity
    v_slot_capacity := v_service_capacity;

    IF v_slot_capacity IS NULL OR v_slot_capacity = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service capacity not configured for service-based mode',
        'slots_generated', 0
      );
    END IF;
  END IF;

  -- Delete existing slots for this shift in the date range
  DELETE FROM slots
  WHERE shift_id = p_shift_id
    AND slot_date >= p_start_date
    AND slot_date <= p_end_date;

  -- Loop through each date in range
  v_current_date := p_start_date;
  WHILE v_current_date <= p_end_date LOOP
    -- Check if this day of week is in shift's days_of_week
    IF EXTRACT(DOW FROM v_current_date)::integer = ANY(v_days_of_week) THEN
      
      -- For employee-based mode, generate slots for each employee
      IF v_capacity_mode = 'employee_based' THEN
        FOR v_employee_id IN 
          SELECT DISTINCT employee_id 
          FROM employee_services 
          WHERE shift_id = p_shift_id
        LOOP
          -- Generate slots for this employee on this date
          v_slot_start_minutes := v_shift_start_minutes;
          
          -- Only generate complete slots (Fix #3: no partial slots)
          WHILE v_slot_start_minutes + v_service_duration_minutes <= v_shift_end_minutes LOOP
            v_slot_end_minutes := v_slot_start_minutes + v_service_duration_minutes;
            
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
            
            -- Insert slot with pooled capacity
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
              is_available,
              is_overbooked,
              original_capacity
            ) VALUES (
              v_tenant_id,
              p_shift_id,
              v_employee_id,
              v_current_date,
              v_start_time,
              v_end_time,
              v_start_timestamp,
              v_end_timestamp,
              v_slot_capacity,
              0,
              true,
              false,
              v_slot_capacity
            );
            
            v_slots_generated := v_slots_generated + 1;
            v_slot_start_minutes := v_slot_start_minutes + v_service_duration_minutes;
          END LOOP;
        END LOOP;
      ELSE
        -- For service-based mode, generate slots without employee assignment
        v_slot_start_minutes := v_shift_start_minutes;
        
        -- Only generate complete slots
        WHILE v_slot_start_minutes + v_service_duration_minutes <= v_shift_end_minutes LOOP
          v_slot_end_minutes := v_slot_start_minutes + v_service_duration_minutes;
          
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
          
          -- Insert slot with service capacity (no employee assignment)
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
            is_available,
            is_overbooked,
            original_capacity
          ) VALUES (
            v_tenant_id,
            p_shift_id,
            NULL,  -- No employee for service-based
            v_current_date,
            v_start_time,
            v_end_time,
            v_start_timestamp,
            v_end_timestamp,
            v_slot_capacity,
            0,
            true,
            false,
            v_slot_capacity
          );
          
          v_slots_generated := v_slots_generated + 1;
          v_slot_start_minutes := v_slot_start_minutes + v_service_duration_minutes;
        END LOOP;
      END IF;
    END IF;
    
    v_current_date := v_current_date + 1;
  END LOOP;

  -- Return success result with details
  RETURN jsonb_build_object(
    'success', true,
    'slots_generated', v_slots_generated,
    'capacity_mode', v_capacity_mode,
    'slot_capacity', v_slot_capacity,
    'shift_duration_minutes', v_shift_duration_minutes,
    'service_duration_minutes', v_service_duration_minutes
  );
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION generate_slots_for_shift IS 'Generates time slots for a shift with support for dual capacity modes (employee_based and service_based). Validates shift-duration compatibility and calculates capacity appropriately per mode.';
