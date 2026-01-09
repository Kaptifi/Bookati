/*
  # Add "What to Expect" section to services

  1. New Fields
    - `show_what_to_expect` (boolean) - Toggle to show/hide the what to expect section
    - `what_to_expect_images` (jsonb) - Array of image URLs for the what to expect section

  2. Defaults
    - `show_what_to_expect` defaults to false
    - `what_to_expect_images` defaults to empty array
*/

-- Add what to expect fields to services table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS show_what_to_expect boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS what_to_expect_images jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN services.show_what_to_expect IS 'Toggle to enable/disable the what to expect section on the service booking page';
COMMENT ON COLUMN services.what_to_expect_images IS 'Array of image URLs displayed in the what to expect section';





















