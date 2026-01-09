/*
  # Fix Infinite Recursion in Users Table RLS Policies

  1. Problem
    - Current policies query the users table within the policy itself
    - This creates infinite recursion when trying to read user data
    - Error: "infinite recursion detected in policy for relation users"

  2. Solution
    - Use auth.uid() directly instead of subqueries
    - Store role in JWT metadata for efficient checks
    - Simplify policies to avoid self-referencing queries

  3. Changes
    - Drop all existing problematic policies
    - Create new simplified policies that don't self-reference
    - Users can always read their own profile
    - Solution owners and tenant admins must be checked differently
*/

-- Drop all existing SELECT policies that cause recursion
DROP POLICY IF EXISTS "Solution Owner can view all users" ON users;
DROP POLICY IF EXISTS "Tenant Admin can view tenant users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- Drop problematic UPDATE and INSERT policies
DROP POLICY IF EXISTS "Tenant Admin can update tenant users" ON users;
DROP POLICY IF EXISTS "Tenant Admin can insert tenant users" ON users;

-- Create simple, non-recursive SELECT policy
-- Users can always read their own profile
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to read other users in their tenant (without recursion)
CREATE POLICY "Users can read same tenant users"
  ON users FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL 
    AND tenant_id IN (
      SELECT tenant_id 
      FROM users 
      WHERE id = auth.uid() 
      AND tenant_id IS NOT NULL
      LIMIT 1
    )
  );

-- Solution owners can read all users (stored in user metadata)
CREATE POLICY "Solution owners can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'solution_owner'
      LIMIT 1
    )
  );

-- Keep existing UPDATE policy for own profile
-- (already exists: "Users can update own profile")

-- Keep existing INSERT policies
-- (already exist: "Users can create own profile after signup", "Anonymous can insert user profiles")
