/*
  # Fix Package Usage Restoration Trigger

  1. Changes
    - Fix trigger to use service_id directly from bookings table (not from slots)
    - Bookings table has service_id column, no need to join with slots

  2. Logic
    - When booking status changes to 'cancelled'
    - Get service_id directly from NEW.service_id
    - Restore usage in package_subscription_usage table
*/

-- Drop and recreate the function with correct logic
DROP FUNCTION IF EXISTS restore_package_usage_on_cancellation() CASCADE;

CREATE OR REPLACE FUNCTION restore_package_usage_on_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if booking is being cancelled and has a package subscription
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.package_subscription_id IS NOT NULL THEN
    
    -- Restore the package usage using service_id from booking
    IF NEW.service_id IS NOT NULL THEN
      UPDATE package_subscription_usage
      SET 
        used_quantity = GREATEST(0, used_quantity - NEW.visitor_count),
        remaining_quantity = remaining_quantity + NEW.visitor_count,
        updated_at = now()
      WHERE 
        subscription_id = NEW.package_subscription_id
        AND service_id = NEW.service_id;
        
      -- Log the restoration for audit
      RAISE NOTICE 'Restored % units of service % to subscription %', 
        NEW.visitor_count, NEW.service_id, NEW.package_subscription_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on bookings table
CREATE TRIGGER trigger_restore_package_usage_on_cancellation
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION restore_package_usage_on_cancellation();

COMMENT ON FUNCTION restore_package_usage_on_cancellation() IS 
  'Automatically restores package usage when a booking is cancelled. Uses service_id directly from bookings table.';
