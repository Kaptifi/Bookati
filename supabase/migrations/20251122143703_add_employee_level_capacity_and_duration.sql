/*
  # Add Employee-Level Capacity and Duration

  1. Changes
    - Adds `duration_minutes` column to `employee_services` table for employee-specific service duration
    - Adds `capacity_per_slot` column to `employee_services` table for employee-specific capacity
    - These fields enable employee-based capacity model where each employee can have different duration and capacity
    
  2. Benefits
    - Allows different employees to perform same service with different durations
    - Enables aggregated capacity calculation based on all assigned employees
    - Provides more flexibility for service delivery
    
  3. Notes
    - When `capacity_mode` is 'employee_based', these fields are required
    - When `capacity_mode` is 'service_based', service-level fields are used instead
*/

-- Add duration_minutes and capacity_per_slot to employee_services
ALTER TABLE employee_services 
ADD COLUMN IF NOT EXISTS duration_minutes integer,
ADD COLUMN IF NOT EXISTS capacity_per_slot integer DEFAULT 1;

-- Add comment to clarify usage
COMMENT ON COLUMN employee_services.duration_minutes IS 'Employee-specific duration for this service (used when service.capacity_mode = employee_based)';
COMMENT ON COLUMN employee_services.capacity_per_slot IS 'Employee-specific capacity per slot for this service (used when service.capacity_mode = employee_based)';