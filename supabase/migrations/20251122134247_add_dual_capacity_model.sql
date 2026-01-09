/*
  # Add Dual Capacity Model Support

  ## Overview
  This migration adds support for two capacity models:
  1. Employee-Based: Capacity calculated from assigned employees
  2. Service-Based: Fixed capacity per service

  ## Changes

  1. New Types
    - `capacity_mode` enum with values: employee_based, service_based

  2. Services Table Updates
    - `capacity_mode` (enum, default: employee_based) - Determines capacity calculation method
    - `service_duration_minutes` (integer, NOT NULL) - Required for both modes to calculate slot timing
    - `service_capacity_per_slot` (integer, nullable) - Only used in service_based mode
    - Constraints ensure mode-specific field requirements

  3. Users Table Updates
    - `capacity_per_slot` (integer, default: 1) - Employee capacity for employee_based mode

  4. Slots Table Updates
    - `is_overbooked` (boolean) - Flag for slots where bookings exceed reduced capacity
    - `original_capacity` (integer) - Preserves historical capacity values

  5. Constraints
    - Service-based services must have service_capacity_per_slot NOT NULL
    - Employee-based services must have service_capacity_per_slot NULL
    - Service duration must always be > 0 for all services

  6. Data Migration
    - Set existing services to employee_based mode
    - Copy duration_minutes to service_duration_minutes
    - Populate original_capacity for existing slots

  ## Critical Fixes Implemented
  - Fix 1: Service duration required for BOTH modes
  - Fix 2: Correct NULL constraints per mode
  - Fix 3: Shift-duration compatibility validation (in app layer)
  - Fix 4: Employee double-booking prevention (in next section)
*/

-- Create capacity mode enum
CREATE TYPE capacity_mode AS ENUM ('employee_based', 'service_based');

-- Add capacity mode fields to services table
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS capacity_mode capacity_mode DEFAULT 'employee_based' NOT NULL,
  ADD COLUMN IF NOT EXISTS service_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS service_capacity_per_slot integer;

-- Migrate existing data: copy duration_minutes to service_duration_minutes
UPDATE services
SET service_duration_minutes = duration_minutes
WHERE service_duration_minutes IS NULL;

-- Make service_duration_minutes NOT NULL after data migration
ALTER TABLE services
  ALTER COLUMN service_duration_minutes SET NOT NULL,
  ADD CONSTRAINT check_service_duration_positive
    CHECK (service_duration_minutes > 0);

-- Add constraint: service_based services must have service_capacity_per_slot
ALTER TABLE services
  ADD CONSTRAINT check_service_based_capacity
    CHECK (
      (capacity_mode = 'service_based' AND service_capacity_per_slot IS NOT NULL AND service_capacity_per_slot > 0)
      OR (capacity_mode = 'employee_based' AND service_capacity_per_slot IS NULL)
    );

-- Add capacity_per_slot to users table for employee capacity
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS capacity_per_slot integer DEFAULT 1 NOT NULL
    CHECK (capacity_per_slot > 0);

-- Add overbooked tracking to slots table
ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS is_overbooked boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS original_capacity integer;

-- Populate original_capacity for existing slots
UPDATE slots
SET original_capacity = available_capacity
WHERE original_capacity IS NULL;

-- Make original_capacity NOT NULL after migration
ALTER TABLE slots
  ALTER COLUMN original_capacity SET NOT NULL;

-- Create trigger to detect overbooked slots when capacity is reduced
CREATE OR REPLACE FUNCTION check_slot_overbooked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If available capacity is reduced below current bookings, mark as overbooked
  IF NEW.available_capacity < NEW.booked_count THEN
    NEW.is_overbooked := true;
  ELSE
    NEW.is_overbooked := false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_slot_overbooked
  BEFORE UPDATE OF available_capacity ON slots
  FOR EACH ROW
  EXECUTE FUNCTION check_slot_overbooked();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_capacity_mode ON services(capacity_mode);
CREATE INDEX IF NOT EXISTS idx_slots_overbooked ON slots(is_overbooked) WHERE is_overbooked = true;
CREATE INDEX IF NOT EXISTS idx_users_capacity ON users(capacity_per_slot);

-- Add helpful comments
COMMENT ON COLUMN services.capacity_mode IS 'Determines how capacity is calculated: employee_based (pooled from employees) or service_based (fixed per service)';
COMMENT ON COLUMN services.service_duration_minutes IS 'Service duration in minutes - required for both capacity modes to calculate slot timing';
COMMENT ON COLUMN services.service_capacity_per_slot IS 'Fixed capacity per slot - only used in service_based mode, must be NULL for employee_based';
COMMENT ON COLUMN users.capacity_per_slot IS 'Number of customers this employee can serve simultaneously - used in employee_based capacity calculation';
COMMENT ON COLUMN slots.is_overbooked IS 'True when available_capacity is less than booked_count due to capacity reduction';
COMMENT ON COLUMN slots.original_capacity IS 'Original capacity when slot was created - preserved for historical accuracy';
