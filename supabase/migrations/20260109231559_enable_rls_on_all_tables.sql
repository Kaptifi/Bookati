-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_invoice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_zoho_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_jobs ENABLE ROW LEVEL SECURITY;

-- Create basic permissive policies for backend access (server will use service role)
-- These allow the backend to perform all operations via service role key

-- Tenants
CREATE POLICY "Allow backend full access to tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);

-- Users
CREATE POLICY "Allow backend full access to users" ON users FOR ALL USING (true) WITH CHECK (true);

-- Service Categories
CREATE POLICY "Allow backend full access to service_categories" ON service_categories FOR ALL USING (true) WITH CHECK (true);

-- Services
CREATE POLICY "Allow backend full access to services" ON services FOR ALL USING (true) WITH CHECK (true);

-- Service Offers
CREATE POLICY "Allow backend full access to service_offers" ON service_offers FOR ALL USING (true) WITH CHECK (true);

-- Shifts
CREATE POLICY "Allow backend full access to shifts" ON shifts FOR ALL USING (true) WITH CHECK (true);

-- Employee Services
CREATE POLICY "Allow backend full access to employee_services" ON employee_services FOR ALL USING (true) WITH CHECK (true);

-- Slots
CREATE POLICY "Allow backend full access to slots" ON slots FOR ALL USING (true) WITH CHECK (true);

-- Customers
CREATE POLICY "Allow backend full access to customers" ON customers FOR ALL USING (true) WITH CHECK (true);

-- Bookings
CREATE POLICY "Allow backend full access to bookings" ON bookings FOR ALL USING (true) WITH CHECK (true);

-- Booking Locks
CREATE POLICY "Allow backend full access to booking_locks" ON booking_locks FOR ALL USING (true) WITH CHECK (true);

-- Service Packages
CREATE POLICY "Allow backend full access to service_packages" ON service_packages FOR ALL USING (true) WITH CHECK (true);

-- Package Services
CREATE POLICY "Allow backend full access to package_services" ON package_services FOR ALL USING (true) WITH CHECK (true);

-- Package Subscriptions
CREATE POLICY "Allow backend full access to package_subscriptions" ON package_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- Package Usage
CREATE POLICY "Allow backend full access to package_usage" ON package_usage FOR ALL USING (true) WITH CHECK (true);

-- Tenant Features
CREATE POLICY "Allow backend full access to tenant_features" ON tenant_features FOR ALL USING (true) WITH CHECK (true);

-- Zoho Tokens
CREATE POLICY "Allow backend full access to zoho_tokens" ON zoho_tokens FOR ALL USING (true) WITH CHECK (true);

-- Zoho Invoice Logs
CREATE POLICY "Allow backend full access to zoho_invoice_logs" ON zoho_invoice_logs FOR ALL USING (true) WITH CHECK (true);

-- Tenant Zoho Configs
CREATE POLICY "Allow backend full access to tenant_zoho_configs" ON tenant_zoho_configs FOR ALL USING (true) WITH CHECK (true);

-- Reviews
CREATE POLICY "Allow backend full access to reviews" ON reviews FOR ALL USING (true) WITH CHECK (true);

-- Testimonials
CREATE POLICY "Allow backend full access to testimonials" ON testimonials FOR ALL USING (true) WITH CHECK (true);

-- Audit Logs
CREATE POLICY "Allow backend full access to audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Payments
CREATE POLICY "Allow backend full access to payments" ON payments FOR ALL USING (true) WITH CHECK (true);

-- OTP Requests
CREATE POLICY "Allow backend full access to otp_requests" ON otp_requests FOR ALL USING (true) WITH CHECK (true);

-- SMS Logs
CREATE POLICY "Allow backend full access to sms_logs" ON sms_logs FOR ALL USING (true) WITH CHECK (true);

-- Queue Jobs
CREATE POLICY "Allow backend full access to queue_jobs" ON queue_jobs FOR ALL USING (true) WITH CHECK (true);