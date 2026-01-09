/*
  # Fix Package Usage Decrement with Database Trigger

  ## Problem
  When multiple bookings are created simultaneously using a package subscription,
  the package usage updates were being lost due to race conditions in the application code.

  ## Solution
  Create a database trigger that automatically decrements package usage when a booking
  is created with a package_subscription_id. This ensures atomic updates and prevents
  race conditions.

  ## Changes
  1. Create trigger function to decrement package usage on booking insert
  2. Create trigger to call the function after booking insert
  3. This replaces the application-level updates with database-level atomic operations
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS decrement_package_usage_on_booking ON bookings;
DROP FUNCTION IF EXISTS decrement_package_usage_on_booking();

-- Create function to decrement package usage when booking is created
CREATE OR REPLACE FUNCTION decrement_package_usage_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if booking uses a package
  IF NEW.package_subscription_id IS NOT NULL AND NEW.status != 'cancelled' THEN
    -- Decrement the package usage for this service
    UPDATE package_subscription_usage
    SET 
      remaining_quantity = remaining_quantity - 1,
      used_quantity = used_quantity + 1,
      updated_at = now()
    WHERE subscription_id = NEW.package_subscription_id
      AND service_id = NEW.service_id
      AND remaining_quantity > 0;
    
    -- Check if update happened (remaining_quantity was > 0)
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No available package quantity for service in subscription %', NEW.package_subscription_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically decrement package usage
CREATE TRIGGER decrement_package_usage_on_booking
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION decrement_package_usage_on_booking();

-- Add comment for documentation
COMMENT ON FUNCTION decrement_package_usage_on_booking() IS 
  'Automatically decrements package usage when a booking with package_subscription_id is created';
