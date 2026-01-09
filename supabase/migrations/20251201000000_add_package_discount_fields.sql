/*
  # Add Discount Fields to Service Packages

  This migration adds discount functionality to service packages, similar to services.
  Packages can now have:
    - original_price: The original combined price before discount
    - discount_percentage: The discount percentage (0-100)
    - total_price: The final price after discount (calculated or set)
*/

-- Add discount fields to service_packages table
ALTER TABLE service_packages
  ADD COLUMN IF NOT EXISTS original_price numeric(10, 2) CHECK (original_price >= 0),
  ADD COLUMN IF NOT EXISTS discount_percentage integer CHECK (discount_percentage >= 0 AND discount_percentage <= 100);

-- Add comment for documentation
COMMENT ON COLUMN service_packages.original_price IS 'Original combined price of all services in the package before discount';
COMMENT ON COLUMN service_packages.discount_percentage IS 'Discount percentage (0-100) applied to the package';



