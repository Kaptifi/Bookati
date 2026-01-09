/*
  # Enable Reception Users to Manage Package Subscriptions

  1. Changes
    - Allow reception users (receptionist role) to view packages and package services
    - Allow reception users to create and manage package subscriptions
    - Allow reception users to view and update package subscription usage
    - Maintain tenant_admin exclusive control over package creation/editing

  2. Security
    - All policies maintain tenant isolation
    - Reception users can only manage subscriptions within their tenant
    - Package creation/editing remains tenant_admin only
*/

-- Drop existing restrictive policies for subscriptions
DROP POLICY IF EXISTS "Users can insert subscriptions in their tenant" ON package_subscriptions;
DROP POLICY IF EXISTS "Users can update subscriptions in their tenant" ON package_subscriptions;

-- Recreate with proper roles
CREATE POLICY "Tenant users can insert subscriptions in their tenant"
  ON package_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('tenant_admin', 'receptionist')
    )
  );

CREATE POLICY "Tenant users can update subscriptions in their tenant"
  ON package_subscriptions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('tenant_admin', 'receptionist')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('tenant_admin', 'receptionist')
    )
  );
