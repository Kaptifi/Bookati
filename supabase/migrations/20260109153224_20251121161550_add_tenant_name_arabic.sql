/*
  # Add Arabic name support to tenants table

  1. Changes
    - Add `name_ar` column to `tenants` table for Arabic names
    - Make it required (NOT NULL) with a default empty string for existing records
    
  2. Notes
    - Existing tenants will have empty Arabic names that can be updated later
    - New tenants will require both English and Arabic names
*/

-- Add Arabic name column to tenants table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'name_ar'
  ) THEN
    ALTER TABLE tenants ADD COLUMN name_ar text NOT NULL DEFAULT '';
  END IF;
END $$;