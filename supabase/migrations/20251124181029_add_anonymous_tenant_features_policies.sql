/*
  # Add Anonymous Access Policies for Tenant Features

  1. Changes
    - Add anonymous SELECT policy for tenant_features table
    - Add anonymous UPDATE policy for tenant_features table
    
  2. Security
    - These policies allow the management interface to work without authentication
    - Management authentication is handled via localStorage flag on the client side
    - In production, this should be replaced with proper service role authentication
*/

-- Allow anonymous users to view all tenant features (for management console)
CREATE POLICY "Anonymous can view tenant features"
  ON tenant_features
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to update tenant features (for management console)
CREATE POLICY "Anonymous can update tenant features"
  ON tenant_features
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
