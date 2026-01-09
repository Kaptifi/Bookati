/*
  # Add Unique Constraint for Service Names per Tenant

  This migration adds a unique constraint to prevent duplicate service names
  within the same tenant. It also removes existing duplicates before adding
  the constraint.

  ## Changes
    - Remove duplicate services (keeps the oldest one based on created_at)
    - Add unique constraint on (tenant_id, LOWER(TRIM(name)))
*/

-- First, remove duplicate services (keep the first one based on created_at)
DO $$
DECLARE
  deleted_count integer;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      tenant_id,
      name,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, LOWER(TRIM(name)) 
        ORDER BY created_at ASC
      ) as row_num
    FROM services
  )
  DELETE FROM services
  WHERE id IN (
    SELECT id FROM duplicates WHERE row_num > 1
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % duplicate services', deleted_count;
  ELSE
    RAISE NOTICE 'No duplicate services found';
  END IF;
END $$;

-- Add unique constraint on tenant_id and normalized service name
-- This prevents duplicate service names within the same tenant
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'services_tenant_name_unique'
  ) THEN
    -- Create unique index (which enforces uniqueness)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_services_tenant_name_unique 
    ON services (tenant_id, LOWER(TRIM(name)));
    
    RAISE NOTICE 'Created unique constraint on services (tenant_id, name)';
  ELSE
    RAISE NOTICE 'Unique constraint already exists';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON INDEX idx_services_tenant_name_unique IS 
  'Ensures unique service names per tenant (case-insensitive, trimmed)';



