/*
  # Add SELECT policy for authenticated users

  1. Purpose
    - Allow authenticated users to read their own profile from users table
    - Fix login issue where profile fetch fails due to missing RLS policy
    
  2. Security
    - Users can only read their own profile (auth.uid() = id)
    - Restricts access to authenticated users only
    
  3. Changes
    - Add SELECT policy for users to read their own data
*/

-- Allow authenticated users to read their own profile
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);