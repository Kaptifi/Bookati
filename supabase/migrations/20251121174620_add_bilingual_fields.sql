/*
  # Add Bilingual Fields for Multi-language Support

  1. Changes to Tables
    - Add Arabic name and description fields to service_categories
    - Add Arabic name and description fields to services
    - Add Arabic name field to users (for employee full names)
    - All fields are required for proper bilingual display

  2. Fields Added
    - service_categories: name_ar, description_ar
    - services: name_ar, description_ar
    - users: full_name_ar

  3. Notes
    - Existing data will have empty strings as defaults
    - Applications should populate both language fields on create/update
*/

-- Add bilingual fields to service_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_categories' AND column_name = 'name_ar'
  ) THEN
    ALTER TABLE service_categories ADD COLUMN name_ar TEXT DEFAULT '' NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_categories' AND column_name = 'description_ar'
  ) THEN
    ALTER TABLE service_categories ADD COLUMN description_ar TEXT;
  END IF;
END $$;

-- Add bilingual fields to services
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'name_ar'
  ) THEN
    ALTER TABLE services ADD COLUMN name_ar TEXT DEFAULT '' NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'description_ar'
  ) THEN
    ALTER TABLE services ADD COLUMN description_ar TEXT;
  END IF;
END $$;

-- Add bilingual field to users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'full_name_ar'
  ) THEN
    ALTER TABLE users ADD COLUMN full_name_ar TEXT DEFAULT '';
  END IF;
END $$;
