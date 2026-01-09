/*
  # Row Level Security Policies
  
  1. Policies Overview
    - Solution Owner: Full access to all data
    - Tenant Admin: Full access to their tenant's data
    - Receptionist/Cashier: Read/write access to bookings and services in their tenant
    - Employee: Read access to their assigned services
    - Public: Read access to public services, create bookings
    
  2. Security Rules
    - All tables protected by RLS
    - Authentication required for most operations
    - Tenant isolation enforced
    - Public booking flow allowed for active tenants
*/

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to get user tenant_id
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- TENANTS POLICIES
-- ============================================

-- Solution Owner can view all tenants
CREATE POLICY "Solution Owner can view all tenants"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- Solution Owner can insert tenants
CREATE POLICY "Solution Owner can insert tenants"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- Solution Owner can update tenants
CREATE POLICY "Solution Owner can update tenants"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- Tenant Admin can view their own tenant
CREATE POLICY "Tenant Admin can view own tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Tenant Admin can update their own tenant
CREATE POLICY "Tenant Admin can update own tenant"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Public can view active tenants with public pages
CREATE POLICY "Public can view active tenants"
  ON tenants FOR SELECT
  TO anon
  USING (is_active = true AND public_page_enabled = true);

-- ============================================
-- USERS POLICIES
-- ============================================

-- Users can create own profile after signup
CREATE POLICY "Users can create own profile after signup"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can view own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Solution Owner can view all users
CREATE POLICY "Solution Owner can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'solution_owner'
    )
  );

-- Tenant Admin can view users in their tenant
CREATE POLICY "Tenant Admin can view tenant users"
  ON users FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Tenant Admin can insert users in their tenant
CREATE POLICY "Tenant Admin can insert tenant users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Tenant Admin can update users in their tenant
CREATE POLICY "Tenant Admin can update tenant users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- SERVICES POLICIES
-- ============================================

-- Tenant users can view services in their tenant
CREATE POLICY "Tenant users can view own tenant services"
  ON services FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Tenant Admin can manage services
CREATE POLICY "Tenant Admin can manage services"
  ON services FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Public can view public services from active tenants
CREATE POLICY "Public can view public services"
  ON services FOR SELECT
  TO anon
  USING (
    is_public = true
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE tenants.id = services.tenant_id
      AND tenants.is_active = true
      AND tenants.maintenance_mode = false
    )
  );

-- Solution Owner can view all services
CREATE POLICY "Solution Owner can view all services"
  ON services FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- ============================================
-- SERVICE CATEGORIES POLICIES
-- ============================================

-- Tenant users can view categories in their tenant
CREATE POLICY "Tenant users can view own categories"
  ON service_categories FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Tenant Admin can manage categories
CREATE POLICY "Tenant Admin can manage categories"
  ON service_categories FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- BOOKINGS POLICIES
-- ============================================

-- Tenant users can view bookings in their tenant
CREATE POLICY "Tenant users can view tenant bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Receptionist and Cashier can create/update bookings
CREATE POLICY "Staff can manage bookings"
  ON bookings FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('tenant_admin', 'receptionist', 'cashier')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('tenant_admin', 'receptionist', 'cashier')
    )
  );

-- Public can create bookings for active tenants
CREATE POLICY "Public can create bookings"
  ON bookings FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants
      WHERE tenants.id = bookings.tenant_id
      AND tenants.is_active = true
      AND tenants.maintenance_mode = false
      AND tenants.public_page_enabled = true
    )
  );

-- Solution Owner can view all bookings
CREATE POLICY "Solution Owner can view all bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- ============================================
-- TIME SLOTS POLICIES
-- ============================================

-- Tenant users can view slots in their tenant
CREATE POLICY "Tenant users can view tenant slots"
  ON time_slots FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Tenant Admin can manage slots
CREATE POLICY "Tenant Admin can manage slots"
  ON time_slots FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- Public can view available slots for public services
CREATE POLICY "Public can view available slots"
  ON time_slots FOR SELECT
  TO anon
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1 FROM services
      WHERE services.id = time_slots.service_id
      AND services.is_public = true
      AND services.is_active = true
      AND EXISTS (
        SELECT 1 FROM tenants
        WHERE tenants.id = services.tenant_id
        AND tenants.is_active = true
        AND tenants.maintenance_mode = false
      )
    )
  );

-- ============================================
-- SHIFTS POLICIES
-- ============================================

-- Tenant users can view shifts in their tenant
CREATE POLICY "Tenant users can view tenant shifts"
  ON shifts FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Tenant Admin can manage shifts
CREATE POLICY "Tenant Admin can manage shifts"
  ON shifts FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- BOOKING LOCKS POLICIES
-- ============================================

-- Anyone can create booking locks (for reservation flow)
CREATE POLICY "Anyone can create booking locks"
  ON booking_locks FOR INSERT
  WITH CHECK (true);

-- Anyone can view booking locks (needed for lock checking)
CREATE POLICY "Anyone can view booking locks"
  ON booking_locks FOR SELECT
  USING (true);

-- Tenant staff can delete expired locks
CREATE POLICY "Tenant staff can delete locks"
  ON booking_locks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM time_slots
      WHERE time_slots.id = booking_locks.slot_id
      AND time_slots.tenant_id IN (
        SELECT tenant_id FROM users
        WHERE users.id = auth.uid()
      )
    )
  );

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================

-- Solution Owner can view all audit logs
CREATE POLICY "Solution Owner can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'solution_owner'
    )
  );

-- Tenant Admin can view their tenant's audit logs
CREATE POLICY "Tenant Admin can view tenant audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'tenant_admin'
    )
  );

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- PAYMENTS POLICIES
-- ============================================

-- Tenant users can view payments in their tenant
CREATE POLICY "Tenant users can view tenant payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Staff can create payments
CREATE POLICY "Staff can create payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('tenant_admin', 'cashier', 'receptionist')
    )
  );
