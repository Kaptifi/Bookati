/*
  # Add policy for tenant users to view all their slots
  
  1. Changes
    - Add policy allowing authenticated tenant users to view ALL slots for their tenant
    - This is needed so bookings can display slot information even when slots are no longer available
  
  2. Security
    - Policy checks that user belongs to the tenant via users table
    - Only affects SELECT operations
*/

-- Allow tenant users to view all slots for their tenant (not just available ones)
CREATE POLICY "Tenant users can view all tenant slots"
  ON slots
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM users
      WHERE id = auth.uid()
    )
  );
