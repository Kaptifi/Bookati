/*
  # Remove Employee Shift Overlap Prevention at Setup Level

  ## Overview
  Removes the constraint that prevents employees from being assigned to overlapping shifts.
  Overlapping prevention should only happen at booking level, not setup level.

  ## Changes
  1. Drop the trigger that prevents employee double-booking during setup
  2. Drop the associated functions
  3. Keep the index as it may be useful for booking queries

  ## Reason
  - Employees should be allowed to be assigned to multiple services with overlapping shifts
  - The system should only prevent actual double-booking when a booking is made
  - Example: An employee can be assigned to both "CCTV Installation" and "Site Survey" 
    even if they have the same shift times (9am-5pm)
  - When a booking is made for CCTV, only then should the employee's availability 
    for Site Survey be reduced for that specific time slot
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS trigger_prevent_employee_double_booking ON employee_services;

-- Drop the trigger function
DROP FUNCTION IF EXISTS prevent_employee_double_booking();

-- Drop the overlap checking function
DROP FUNCTION IF EXISTS check_employee_shift_overlap(uuid, uuid, uuid);

-- Keep the index as it's useful for booking-level queries
-- CREATE INDEX IF NOT EXISTS idx_employee_services_employee_shift 
--   ON employee_services(employee_id, shift_id);

COMMENT ON TABLE employee_services IS 'Stores employee assignments to services and shifts. Employees can be assigned to multiple services with overlapping shifts. Booking conflicts are handled at the booking level, not setup level.';
