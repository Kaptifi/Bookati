/*
  # Create Tenant Features Management System

  1. New Tables
    - `tenant_features`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `employees_enabled` (boolean) - Enable/disable employees module
      - `employee_assignment_mode` (text) - 'automatic', 'manual', or 'both'
      - `packages_enabled` (boolean) - Enable/disable packages module
      - `landing_page_enabled` (boolean) - Enable/disable customer landing page
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `tenant_features` table
    - Add policy for solution owner to manage all tenant features
    - Add policy for tenant admins to view their own tenant features

  3. Default Values
    - All features enabled by default for existing tenants
*/

-- Create tenant_features table
CREATE TABLE IF NOT EXISTS tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
  employees_enabled boolean DEFAULT true NOT NULL,
  employee_assignment_mode text DEFAULT 'both' NOT NULL CHECK (employee_assignment_mode IN ('automatic', 'manual', 'both')),
  packages_enabled boolean DEFAULT true NOT NULL,
  landing_page_enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;

-- Policy for solution owner to manage all tenant features
CREATE POLICY "Solution owner can manage all tenant features"
  ON tenant_features
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- Policy for tenant admins to view their own tenant features
CREATE POLICY "Tenant admins can view own features"
  ON tenant_features
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Create function to automatically create tenant_features when a new tenant is created
CREATE OR REPLACE FUNCTION create_tenant_features_for_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_features (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create tenant_features
DROP TRIGGER IF EXISTS create_tenant_features_trigger ON tenants;
CREATE TRIGGER create_tenant_features_trigger
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_tenant_features_for_new_tenant();

-- Create default features for existing tenants
INSERT INTO tenant_features (tenant_id)
SELECT id FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_features)
ON CONFLICT (tenant_id) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_tenant_features_updated_at_trigger ON tenant_features;
CREATE TRIGGER update_tenant_features_updated_at_trigger
  BEFORE UPDATE ON tenant_features
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_features_updated_at();
