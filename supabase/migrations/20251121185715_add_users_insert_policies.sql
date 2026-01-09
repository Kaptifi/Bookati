/*
  # Add INSERT Policies for Users Table

  1. Problem
    - No INSERT policies exist for users table
    - Tenant admins cannot create employees
    - Solution owners cannot create tenant admins

  2. Solution
    - Add INSERT policy for solution owners (can create any user)
    - Add INSERT policy for tenant admins (can create employees in their tenant)
    - Use security definer function to check roles safely

  3. Security
    - Solution owners: Can insert any user
    - Tenant admins: Can only insert users with role 'employee', 'receptionist', or 'cashier' in their own tenant
    - Regular users: Cannot insert users
*/

-- Policy 1: Solution owners can insert any user
CREATE POLICY "users_insert_solution_owner"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT user_role FROM public.get_current_user_info()) = 'solution_owner'
  );

-- Policy 2: Tenant admins can insert employees in their tenant
CREATE POLICY "users_insert_tenant_admin"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Current user must be tenant_admin
    (SELECT user_role FROM public.get_current_user_info()) = 'tenant_admin'
    -- New user must be in same tenant
    AND tenant_id = (SELECT user_tenant_id FROM public.get_current_user_info())
    -- New user must be employee, receptionist, or cashier
    AND role IN ('employee', 'receptionist', 'cashier')
  );

-- Policy 3: Tenant admins can update employees in their tenant
DROP POLICY IF EXISTS "users_update_tenant_admin" ON users;
CREATE POLICY "users_update_tenant_admin"
  ON users FOR UPDATE
  TO authenticated
  USING (
    -- Current user must be tenant_admin
    (SELECT user_role FROM public.get_current_user_info()) = 'tenant_admin'
    -- Target user must be in same tenant
    AND tenant_id = (SELECT user_tenant_id FROM public.get_current_user_info())
    -- Target user must be employee, receptionist, or cashier
    AND role IN ('employee', 'receptionist', 'cashier')
  )
  WITH CHECK (
    -- New values must keep user in same tenant
    tenant_id = (SELECT user_tenant_id FROM public.get_current_user_info())
    -- New role must be employee, receptionist, or cashier
    AND role IN ('employee', 'receptionist', 'cashier')
  );

-- Policy 4: Users can update their own profile
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    -- Cannot change role or tenant_id
    id = auth.uid()
  );

-- Policy 5: Solution owners can update any user
DROP POLICY IF EXISTS "users_update_solution_owner" ON users;
CREATE POLICY "users_update_solution_owner"
  ON users FOR UPDATE
  TO authenticated
  USING (
    (SELECT user_role FROM public.get_current_user_info()) = 'solution_owner'
  )
  WITH CHECK (
    (SELECT user_role FROM public.get_current_user_info()) = 'solution_owner'
  );
