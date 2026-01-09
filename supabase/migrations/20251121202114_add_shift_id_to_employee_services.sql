/*
  # Add shift assignments to employee_services

  1. Changes
    - Add `shift_id` column to `employee_services` table to link employees to specific shifts
    - Update unique constraint to include shift_id (employee can work same service on different shifts)
    - Add foreign key constraint to shifts table
    
  2. Notes
    - Allows assigning employees to specific shifts within a service
    - Example: Employee A works Monday-Wednesday 9am-5pm, Employee B works Thursday-Friday 2pm-10pm
*/

-- Drop the old unique constraint
ALTER TABLE employee_services DROP CONSTRAINT IF EXISTS employee_services_employee_id_service_id_key;

-- Add shift_id column
ALTER TABLE employee_services ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE;

-- Create new unique constraint that includes shift_id
-- An employee can be assigned to the same service but different shifts
ALTER TABLE employee_services ADD CONSTRAINT employee_services_employee_service_shift_key 
  UNIQUE(employee_id, service_id, shift_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_employee_services_shift_id ON employee_services(shift_id);