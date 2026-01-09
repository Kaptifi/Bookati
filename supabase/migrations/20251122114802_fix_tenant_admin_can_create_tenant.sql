/*
  # Fix tenant creation for new signups

  1. Changes
    - Add policy to allow authenticated tenant_admin users to create their own tenant during signup
    - This policy allows tenant_admin users who don't have a tenant_id yet to create one
  
  2. Security
    - Only allows tenant creation by authenticated users with tenant_admin role
    - Users can only create one tenant (enforced by the subsequent tenant_id update)
*/

-- Drop the restrictive solution_owner insert policy and replace with one that allows tenant_admin
DROP POLICY IF EXISTS "Solution Owner can insert tenants" ON tenants;

CREATE POLICY "Tenant Admin can create own tenant"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'tenant_admin'
      AND users.tenant_id IS NULL
    )
  );

CREATE POLICY "Solution Owner can insert any tenant"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'solution_owner'
    )
  );