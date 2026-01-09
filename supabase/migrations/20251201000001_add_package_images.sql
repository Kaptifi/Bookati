/*
  # Add Image Fields to Service Packages

  This migration adds image support to service packages, similar to services.
  Packages can now have:
    - image_url: Main/featured image URL (base64 or URL)
    - gallery_urls: Array of image URLs (JSONB array)
*/

-- Add image fields to service_packages table
ALTER TABLE service_packages
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS gallery_urls jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN service_packages.image_url IS 'Main/featured image URL (base64 or URL)';
COMMENT ON COLUMN service_packages.gallery_urls IS 'Array of image URLs (JSONB array)';



