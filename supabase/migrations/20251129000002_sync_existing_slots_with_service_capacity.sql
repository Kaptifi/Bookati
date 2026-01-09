/*
  # Sync Existing Slots with Service Capacity

  ## Overview
  This migration syncs all existing slots with their service's current capacity.
  This fixes the issue where slots created before a service capacity change
  still have the old capacity values.

  ## Problem
  - Slots created with old capacity (e.g., 10) remain unchanged when service capacity is updated (e.g., to 1)
  - This allows overbooking because slots have higher capacity than the service allows
  - Only affects slots created before the capacity change

  ## Solution
  - Update all future slots to match their service's current capacity
  - Recalculate available_capacity based on current bookings
  - Mark slots as overbooked if booked_count exceeds new capacity
*/

-- Function to sync all slots with their service capacity
CREATE OR REPLACE FUNCTION sync_all_slots_with_service_capacity()
RETURNS TABLE (
  service_id uuid,
  service_name text,
  slots_updated integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_service_record RECORD;
  v_updated_count integer;
BEGIN
  -- Loop through all service_based services
  FOR v_service_record IN
    SELECT 
      s.id,
      s.name,
      s.service_capacity_per_slot
    FROM services s
    WHERE s.capacity_mode = 'service_based'
      AND s.service_capacity_per_slot IS NOT NULL
  LOOP
    -- Update all future slots for this service
    UPDATE slots sl
    SET 
      original_capacity = v_service_record.service_capacity_per_slot,
      available_capacity = GREATEST(0, v_service_record.service_capacity_per_slot - sl.booked_count),
      is_overbooked = (sl.booked_count > v_service_record.service_capacity_per_slot)
    FROM shifts sh
    WHERE sh.service_id = v_service_record.id
      AND sl.shift_id = sh.id
      AND sl.slot_date >= CURRENT_DATE
      AND (sl.original_capacity != v_service_record.service_capacity_per_slot
           OR sl.available_capacity != GREATEST(0, v_service_record.service_capacity_per_slot - sl.booked_count));
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    -- Return result
    service_id := v_service_record.id;
    service_name := v_service_record.name;
    slots_updated := v_updated_count;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Run the sync function
DO $$
DECLARE
  v_result RECORD;
  v_total_updated integer := 0;
BEGIN
  RAISE NOTICE 'Starting slot capacity sync...';
  
  FOR v_result IN
    SELECT * FROM sync_all_slots_with_service_capacity()
  LOOP
    IF v_result.slots_updated > 0 THEN
      RAISE NOTICE 'Service %: Updated % slots', v_result.service_name, v_result.slots_updated;
      v_total_updated := v_total_updated + v_result.slots_updated;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Sync complete. Total slots updated: %', v_total_updated;
END $$;

-- Add comment
COMMENT ON FUNCTION sync_all_slots_with_service_capacity() IS 
  'Syncs all future slots with their service''s current capacity. Can be run manually to fix capacity mismatches.';







