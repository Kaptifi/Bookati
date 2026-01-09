/*
  # Add Tenant Slug Field for URL Routing

  1. Changes
    - Add `slug` column to `tenants` table
      - Unique slug for tenant URL routing (e.g., "techflipp" for /techflipp)
      - Auto-generated from tenant name on insert
      - Used for clean, readable URLs
    
  2. Security
    - Slug must be unique across all tenants
    - Automatically generated and validated
    
  3. Migration Steps
    - Add slug column with unique constraint
    - Generate slugs for existing tenants based on their name
    - Add function to auto-generate slug on insert
*/

-- Add slug column to tenants table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'slug'
  ) THEN
    ALTER TABLE tenants ADD COLUMN slug text UNIQUE;
  END IF;
END $$;

-- Generate slugs for existing tenants
UPDATE tenants
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g'))
WHERE slug IS NULL;

-- Make slug NOT NULL after populating existing records
ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;

-- Create function to auto-generate slug from name
CREATE OR REPLACE FUNCTION generate_tenant_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate slug on insert
DROP TRIGGER IF EXISTS set_tenant_slug ON tenants;
CREATE TRIGGER set_tenant_slug
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION generate_tenant_slug();

-- Add index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
