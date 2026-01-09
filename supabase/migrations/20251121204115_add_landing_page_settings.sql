/*
  # Add landing page settings to tenants table

  1. Changes
    - Add `landing_page_settings` (jsonb) column to tenants table
    - This stores customizable settings for the public booking landing page
    
  2. Notes
    - Column is nullable to support tenants who haven't customized yet
    - Settings include hero section, about section, colors, contact info, social links
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'landing_page_settings'
  ) THEN
    ALTER TABLE tenants ADD COLUMN landing_page_settings jsonb DEFAULT NULL;
  END IF;
END $$;