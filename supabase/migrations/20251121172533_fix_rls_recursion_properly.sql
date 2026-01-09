/*
  # Fix RLS Infinite Recursion with Security Definer Function

  1. Problem
    - Policies querying users table create infinite recursion
    - Cannot check user role without self-referencing

  2. Solution
    - Create SECURITY DEFINER function in public schema
    - Function bypasses RLS to get current user's data
    - Use function results in policies

  3. Security
    - Function only returns data for auth.uid()
    - SECURITY DEFINER allows bypassing RLS safely
    - No data leakage as it's user-specific
*/

-- Drop all problematic SELECT policies
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can read same tenant users" ON users;
DROP POLICY IF EXISTS "Solution owners can read all users" ON users;
DROP POLICY IF EXISTS "Solution owners read all" ON users;
DROP POLICY IF EXISTS "Tenant users read same tenant" ON users;

-- Create security definer function to safely get current user info
CREATE OR REPLACE FUNCTION public.get_current_user_info()
RETURNS TABLE(user_role user_role, user_tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT u.role, u.tenant_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_current_user_info() TO authenticated, anon;

-- Policy 1: Users can always read their own profile
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 2: Solution owners can read all users
CREATE POLICY "users_select_solution_owner"
  ON users FOR SELECT
  TO authenticated
  USING (
    (SELECT user_role FROM public.get_current_user_info()) = 'solution_owner'
  );

-- Policy 3: Tenant members can read other users in their tenant
CREATE POLICY "users_select_same_tenant"
  ON users FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = (SELECT user_tenant_id FROM public.get_current_user_info())
  );
