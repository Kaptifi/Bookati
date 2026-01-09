/*
  # Allow Anonymous Tenant Management
  
  1. Changes
    - Add policies to allow anonymous users to perform tenant operations
    - This enables the management portal (which uses localStorage auth) to work
    
  2. Security Note
    - This is for development/demo purposes
    - In production, implement proper authentication or use edge functions
*/

-- Allow anonymous users to view all tenants
CREATE POLICY "Anonymous can view all tenants"
  ON tenants FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to insert tenants
CREATE POLICY "Anonymous can insert tenants"
  ON tenants FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to update tenants
CREATE POLICY "Anonymous can update tenants"
  ON tenants FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
