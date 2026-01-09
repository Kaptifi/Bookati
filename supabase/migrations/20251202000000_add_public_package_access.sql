/*
  # Add Public Access Policies for Service Packages

  This migration adds RLS policies to allow anonymous (public) users to view
  active service packages and their associated services, similar to how
  public services are accessible.

  ## Changes
    - Add anonymous SELECT policy for service_packages table
    - Add anonymous SELECT policy for package_services table
    - Packages must be active and belong to active tenants
*/

-- Allow public users to view active packages from active tenants
CREATE POLICY "Public can view active packages"
  ON service_packages FOR SELECT
  TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE tenants.id = service_packages.tenant_id
      AND tenants.is_active = true
      AND tenants.maintenance_mode = false
    )
  );

-- Allow public users to view package services for active packages
CREATE POLICY "Public can view package services for active packages"
  ON package_services FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM service_packages
      WHERE service_packages.id = package_services.package_id
      AND service_packages.is_active = true
      AND EXISTS (
        SELECT 1 FROM tenants
        WHERE tenants.id = service_packages.tenant_id
        AND tenants.is_active = true
        AND tenants.maintenance_mode = false
      )
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Public can view active packages" ON service_packages IS 
  'Allows anonymous users to view active packages from active tenants for public booking flow';

COMMENT ON POLICY "Public can view package services for active packages" ON package_services IS 
  'Allows anonymous users to view services included in active packages for public booking flow';



