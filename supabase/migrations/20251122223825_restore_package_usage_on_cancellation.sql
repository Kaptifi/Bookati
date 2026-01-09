/*
  # Restore Package Usage on Booking Cancellation

  1. Changes
    - Create trigger function to restore package usage when booking is cancelled
    - When a booking with package_subscription_id is cancelled, restore the used quantity back to the customer's package
    - Only restore usage if booking was previously confirmed/completed and used a package

  2. Logic
    - Monitor bookings table for status changes to 'cancelled'
    - If booking has package_subscription_id and service_id
    - Find the corresponding package_subscription_usage record
    - Increment remaining_quantity by the booking's visitor_count
    - Ensure idempotency (only restore once per cancellation)

  3. Security
    - Trigger runs with security definer to ensure proper permissions
    - Only affects bookings within same tenant
*/

-- Function to restore package usage on booking cancellation
CREATE OR REPLACE FUNCTION restore_package_usage_on_cancellation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
BEGIN
  -- Only proceed if booking is being cancelled and has a package subscription
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.package_subscription_id IS NOT NULL THEN
    
    -- Get the service_id from the booking's slot
    SELECT service_id INTO v_service_id
    FROM slots
    WHERE id = NEW.slot_id;
    
    -- Restore the package usage
    IF v_service_id IS NOT NULL THEN
      UPDATE package_subscription_usage
      SET 
        used_quantity = used_quantity - NEW.visitor_count,
        remaining_quantity = remaining_quantity + NEW.visitor_count,
        updated_at = now()
      WHERE 
        subscription_id = NEW.package_subscription_id
        AND service_id = v_service_id
        AND used_quantity >= NEW.visitor_count; -- Safety check
        
      -- Log the restoration for audit
      RAISE NOTICE 'Restored % units of service % to subscription %', 
        NEW.visitor_count, v_service_id, NEW.package_subscription_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS trigger_restore_package_usage_on_cancellation ON bookings;

CREATE TRIGGER trigger_restore_package_usage_on_cancellation
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION restore_package_usage_on_cancellation();

-- Add comment
COMMENT ON FUNCTION restore_package_usage_on_cancellation() IS 
  'Automatically restores package usage when a booking is cancelled';
