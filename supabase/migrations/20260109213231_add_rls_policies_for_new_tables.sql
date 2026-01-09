/*
  # Add RLS Policies for New Tables

  1. Security Policies
    - Customers: Tenant users can view, receptionists can manage
    - Service Packages: Public read, tenant admin manages
    - Reviews: Public can view approved, tenant admin manages
    - Testimonials: Public can view active, tenant admin manages
    - Employee Services: Employees can view their assignments
    - Service Offers: Public can view active, tenant admin manages
    - Tenant Features: Tenant users can read, admin manages
    - Zoho tables: Tenant admin only
*/

-- ============================================
-- CUSTOMERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant users can view customers" ON customers;
CREATE POLICY "Tenant users can view customers" ON customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = customers.tenant_id
    )
  );

DROP POLICY IF EXISTS "Receptionist can manage customers" ON customers;
CREATE POLICY "Receptionist can manage customers" ON customers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = customers.tenant_id
      AND users.role IN ('tenant_admin', 'receptionist', 'cashier')
    )
  );

-- ============================================
-- SERVICE PACKAGES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Public packages are viewable" ON service_packages;
CREATE POLICY "Public packages are viewable" ON service_packages
  FOR SELECT
  USING (is_public = true AND is_active = true);

DROP POLICY IF EXISTS "Tenant users can view their packages" ON service_packages;
CREATE POLICY "Tenant users can view their packages" ON service_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = service_packages.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage packages" ON service_packages;
CREATE POLICY "Tenant admins can manage packages" ON service_packages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = service_packages.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- PACKAGE SERVICES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Public can view package services" ON package_services;
CREATE POLICY "Public can view package services" ON package_services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_packages
      WHERE service_packages.id = package_services.package_id
      AND service_packages.is_public = true
      AND service_packages.is_active = true
    )
  );

DROP POLICY IF EXISTS "Tenant users can view their package services" ON package_services;
CREATE POLICY "Tenant users can view their package services" ON package_services
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_packages sp
      JOIN users u ON u.tenant_id = sp.tenant_id
      WHERE sp.id = package_services.package_id
      AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage package services" ON package_services;
CREATE POLICY "Tenant admins can manage package services" ON package_services
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_packages sp
      JOIN users u ON u.tenant_id = sp.tenant_id
      WHERE sp.id = package_services.package_id
      AND u.id = auth.uid()
      AND u.role = 'tenant_admin'
    )
  );

-- ============================================
-- PACKAGE SUBSCRIPTIONS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Customers can view their subscriptions" ON package_subscriptions;
CREATE POLICY "Customers can view their subscriptions" ON package_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = package_subscriptions.customer_id
      AND c.phone IN (
        SELECT u.phone FROM users u WHERE u.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Tenant users can view subscriptions" ON package_subscriptions;
CREATE POLICY "Tenant users can view subscriptions" ON package_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = package_subscriptions.tenant_id
    )
  );

DROP POLICY IF EXISTS "Receptionist can manage subscriptions" ON package_subscriptions;
CREATE POLICY "Receptionist can manage subscriptions" ON package_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = package_subscriptions.tenant_id
      AND users.role IN ('tenant_admin', 'receptionist', 'cashier')
    )
  );

-- ============================================
-- PACKAGE USAGE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant users can view package usage" ON package_usage;
CREATE POLICY "Tenant users can view package usage" ON package_usage
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM package_subscriptions ps
      JOIN users u ON u.tenant_id = ps.tenant_id
      WHERE ps.id = package_usage.subscription_id
      AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "System can manage package usage" ON package_usage;
CREATE POLICY "System can manage package usage" ON package_usage
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM package_subscriptions ps
      JOIN users u ON u.tenant_id = ps.tenant_id
      WHERE ps.id = package_usage.subscription_id
      AND u.id = auth.uid()
      AND u.role IN ('tenant_admin', 'receptionist', 'cashier')
    )
  );

-- ============================================
-- SERVICE OFFERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Public can view active offers" ON service_offers;
CREATE POLICY "Public can view active offers" ON service_offers
  FOR SELECT
  USING (is_active = true AND CURRENT_DATE BETWEEN start_date AND end_date);

DROP POLICY IF EXISTS "Tenant users can view their offers" ON service_offers;
CREATE POLICY "Tenant users can view their offers" ON service_offers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = service_offers.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage offers" ON service_offers;
CREATE POLICY "Tenant admins can manage offers" ON service_offers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = service_offers.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- EMPLOYEE SERVICES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Employees can view their assignments" ON employee_services;
CREATE POLICY "Employees can view their assignments" ON employee_services
  FOR SELECT TO authenticated
  USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = employee_services.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage employee services" ON employee_services;
CREATE POLICY "Tenant admins can manage employee services" ON employee_services
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = employee_services.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- REVIEWS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Anyone can view approved reviews" ON reviews;
CREATE POLICY "Anyone can view approved reviews" ON reviews
  FOR SELECT
  USING (is_approved = true);

DROP POLICY IF EXISTS "Tenant users can view all reviews" ON reviews;
CREATE POLICY "Tenant users can view all reviews" ON reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = reviews.tenant_id
    )
  );

DROP POLICY IF EXISTS "Customers can create reviews" ON reviews;
CREATE POLICY "Customers can create reviews" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.customer_phone IN (
        SELECT u.phone FROM users u WHERE u.id = auth.uid()
      )
      AND b.tenant_id = reviews.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage reviews" ON reviews;
CREATE POLICY "Tenant admins can manage reviews" ON reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = reviews.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- TESTIMONIALS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Anyone can view active testimonials" ON testimonials;
CREATE POLICY "Anyone can view active testimonials" ON testimonials
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Tenant users can view all testimonials" ON testimonials;
CREATE POLICY "Tenant users can view all testimonials" ON testimonials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = testimonials.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage testimonials" ON testimonials;
CREATE POLICY "Tenant admins can manage testimonials" ON testimonials
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = testimonials.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- TENANT FEATURES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant users can view features" ON tenant_features;
CREATE POLICY "Tenant users can view features" ON tenant_features
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = tenant_features.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins can manage features" ON tenant_features;
CREATE POLICY "Tenant admins can manage features" ON tenant_features
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = tenant_features.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- ZOHO TOKENS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant admins can manage zoho tokens" ON zoho_tokens;
CREATE POLICY "Tenant admins can manage zoho tokens" ON zoho_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = zoho_tokens.tenant_id
      AND users.role = 'tenant_admin'
    )
  );

-- ============================================
-- ZOHO INVOICE LOGS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant users can view zoho logs" ON zoho_invoice_logs;
CREATE POLICY "Tenant users can view zoho logs" ON zoho_invoice_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = zoho_invoice_logs.tenant_id
    )
  );

DROP POLICY IF EXISTS "System can create zoho logs" ON zoho_invoice_logs;
CREATE POLICY "System can create zoho logs" ON zoho_invoice_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = zoho_invoice_logs.tenant_id
    )
  );

-- ============================================
-- TENANT ZOHO CONFIGS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Tenant admins can manage zoho configs" ON tenant_zoho_configs;
CREATE POLICY "Tenant admins can manage zoho configs" ON tenant_zoho_configs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.tenant_id = tenant_zoho_configs.tenant_id
      AND users.role = 'tenant_admin'
    )
  );