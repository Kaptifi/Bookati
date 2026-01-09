/*
  # Allow Anonymous User Profile Creation
  
  1. Changes
    - Add policy to allow anonymous users to insert user profiles
    - This enables the management portal to create tenant admin accounts
    
  2. Security Note
    - This is needed for tenant creation flow
    - The tenant admin can then login with their email/password
*/

-- Allow anonymous users to insert user profiles
CREATE POLICY "Anonymous can insert user profiles"
  ON users FOR INSERT
  TO anon
  WITH CHECK (true);