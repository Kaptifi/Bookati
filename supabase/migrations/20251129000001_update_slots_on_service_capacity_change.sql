/*
  # Update Slots When Service Capacity Changes

  ## Overview
  When a service's capacity (service_capacity_per_slot) is updated, all existing slots
  for that service must be updated to reflect the new capacity.

  ## Problem
  - When editing a service to change capacity, existing slots retain their old capacity
  - This allows overbooking because slots have higher capacity than the service allows
  - New services work correctly because slots are generated with correct capacity

  ## Solution
  - Create a trigger that updates slots when service_capacity_per_slot changes
  - Update original_capacity to match new service capacity
  - Recalculate available_capacity based on current bookings
  - Prevent reducing capacity below current bookings (mark as overbooked if needed)
*/

-- Function to update slots when service capacity changes
CREATE OR REPLACE FUNCTION update_slots_on_service_capacity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_capacity integer;
  v_old_capacity integer;
  v_updated_count integer;
BEGIN
  -- Only process if service is service_based and has capacity set
  IF NEW.capacity_mode = 'service_based' 
     AND NEW.service_capacity_per_slot IS NOT NULL THEN
    
    v_new_capacity := NEW.service_capacity_per_slot;
    v_old_capacity := OLD.service_capacity_per_slot;
    
    -- Update all future slots for this service
    -- For each slot:
    -- 1. Update original_capacity to new service capacity
    -- 2. Recalculate available_capacity = new_capacity - booked_count
    -- 3. Mark as overbooked if booked_count > new_capacity
    
    UPDATE slots s
    SET 
      original_capacity = v_new_capacity,
      available_capacity = GREATEST(0, v_new_capacity - s.booked_count),
      is_overbooked = (s.booked_count > v_new_capacity)
    FROM shifts sh
    WHERE sh.service_id = NEW.id
      AND s.shift_id = sh.id
      AND s.slot_date >= CURRENT_DATE; -- Only update future slots
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    -- Log the update
    IF v_old_capacity IS DISTINCT FROM v_new_capacity THEN
      RAISE NOTICE 'Updated % slots for service %: capacity changed from % to %', 
        v_updated_count, NEW.id, COALESCE(v_old_capacity::text, 'NULL'), v_new_capacity;
    ELSE
      RAISE NOTICE 'Updated % slots for service %: capacity set to %', 
        v_updated_count, NEW.id, v_new_capacity;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on services table
DROP TRIGGER IF EXISTS trigger_update_slots_on_service_capacity_change ON services;
CREATE TRIGGER trigger_update_slots_on_service_capacity_change
  AFTER UPDATE OF service_capacity_per_slot, capacity_mode ON services
  FOR EACH ROW
  WHEN (NEW.capacity_mode = 'service_based' AND NEW.service_capacity_per_slot IS NOT NULL)
  EXECUTE FUNCTION update_slots_on_service_capacity_change();

-- Add comment
COMMENT ON FUNCTION update_slots_on_service_capacity_change() IS 
  'Automatically updates slot capacities when service capacity is changed. Only affects future slots.';

