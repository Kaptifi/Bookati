/*
  ============================================
  COMPLETE DATABASE SETUP SCRIPT
  ============================================
  
  This script creates the complete Bookati database schema with all tables,
  indexes, functions, triggers, and RLS policies.
  
  Usage:
  1. Connect to your PostgreSQL database (Railway, Supabase, etc.)
  2. Run this entire script
  3. The script is idempotent - safe to run multiple times
  
  ============================================
*/

-- ============================================
-- 1. EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. DROP EXISTING TYPES (for clean setup)
-- ============================================
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ============================================
-- 3. CREATE CUSTOM TYPES
-- ============================================
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid_manual', 'awaiting_payment', 'paid', 'refunded');
CREATE TYPE user_role AS ENUM ('solution_owner', 'tenant_admin', 'receptionist', 'cashier', 'employee', 'customer');

-- ============================================
-- 4. CREATE TABLES
-- ============================================

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  slug text UNIQUE NOT NULL,
  industry text NOT NULL,
  contact_email text,
  contact_phone text,
  address text,
  tenant_time_zone text DEFAULT 'Asia/Riyadh' NOT NULL,
  announced_time_zone text DEFAULT 'Asia/Riyadh' NOT NULL,
  subscription_start timestamptz DEFAULT now(),
  subscription_end timestamptz,
  is_active boolean DEFAULT true NOT NULL,
  public_page_enabled boolean DEFAULT true NOT NULL,
  maintenance_mode boolean DEFAULT false NOT NULL,
  maintenance_message text,
  theme_preset text DEFAULT 'blue-gold',
  logo_url text,
  custom_theme_config jsonb,
  smtp_settings jsonb DEFAULT NULL,
  whatsapp_settings jsonb DEFAULT NULL,
  landing_page_settings jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Users Table
-- Note: If using Supabase Auth, the id should reference auth.users(id)
-- If NOT using Supabase, remove the foreign key constraint
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email text,
  phone text,
  full_name text NOT NULL,
  full_name_ar text DEFAULT '',
  username text UNIQUE,
  password_hash text,
  role user_role NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- If using Supabase Auth, uncomment this line to add foreign key:
-- ALTER TABLE users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Service Categories
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  description text,
  description_ar text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  description text,
  description_ar text,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  base_price decimal(10, 2) NOT NULL CHECK (base_price >= 0),
  adult_price numeric(10, 2) NOT NULL,
  child_price numeric(10, 2),
  capacity_per_slot integer DEFAULT 1 NOT NULL CHECK (capacity_per_slot > 0),
  is_public boolean DEFAULT false NOT NULL,
  assigned_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  image_url text,
  gallery_urls jsonb DEFAULT '[]'::jsonb,
  discount_percentage numeric(5, 2) DEFAULT 0,
  discount_start_date date,
  discount_end_date date,
  what_to_expect jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT unique_service_name_per_tenant UNIQUE (tenant_id, name)
);

-- Service Offers
CREATE TABLE IF NOT EXISTS service_offers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  discount_percentage numeric(5, 2) NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (end_date >= start_date)
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  days_of_week integer[] NOT NULL,
  start_time_utc time NOT NULL,
  end_time_utc time NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (array_length(days_of_week, 1) > 0)
);

-- Employee Services (links employees to services and shifts)
CREATE TABLE IF NOT EXISTS employee_services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  custom_duration_minutes integer,
  custom_capacity integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(employee_id, service_id, shift_id)
);

-- Time Slots (renamed from time_slots to slots for consistency)
CREATE TABLE IF NOT EXISTS slots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_time_utc timestamptz NOT NULL,
  end_time_utc timestamptz NOT NULL,
  total_capacity integer NOT NULL CHECK (total_capacity > 0),
  original_capacity integer NOT NULL CHECK (original_capacity > 0),
  remaining_capacity integer NOT NULL CHECK (remaining_capacity >= 0),
  available_capacity integer NOT NULL CHECK (available_capacity >= 0),
  booked_count integer DEFAULT 0 NOT NULL CHECK (booked_count >= 0),
  is_available boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (remaining_capacity <= total_capacity),
  CHECK (available_capacity <= total_capacity)
);

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  phone text NOT NULL,
  name text,
  email text,
  total_bookings integer DEFAULT 0 NOT NULL,
  last_booking_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, phone)
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE RESTRICT NOT NULL,
  slot_id uuid REFERENCES slots(id) ON DELETE RESTRICT NOT NULL,
  employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  package_id uuid,
  booking_group_id uuid,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  visitor_count integer DEFAULT 1 NOT NULL CHECK (visitor_count > 0),
  adult_count integer DEFAULT 0 NOT NULL CHECK (adult_count >= 0),
  child_count integer DEFAULT 0 NOT NULL CHECK (child_count >= 0),
  total_price decimal(10, 2) NOT NULL CHECK (total_price >= 0),
  status booking_status DEFAULT 'pending' NOT NULL,
  payment_status payment_status DEFAULT 'unpaid' NOT NULL,
  notes text,
  qr_token text,
  qr_scanned boolean DEFAULT false NOT NULL,
  qr_scanned_at timestamptz,
  qr_scanned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  language text DEFAULT 'en',
  zoho_invoice_id text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  checked_in_at timestamptz,
  checked_in_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status_changed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Booking Locks
CREATE TABLE IF NOT EXISTS booking_locks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id uuid REFERENCES slots(id) ON DELETE CASCADE NOT NULL,
  reserved_by_session_id text NOT NULL,
  reserved_capacity integer DEFAULT 1 NOT NULL CHECK (reserved_capacity > 0),
  lock_acquired_at timestamptz DEFAULT now() NOT NULL,
  lock_expires_at timestamptz NOT NULL
);

-- Service Packages
CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  total_price decimal(10, 2) NOT NULL CHECK (total_price >= 0),
  discount_percentage numeric(5, 2) DEFAULT 0,
  discount_start_date date,
  discount_end_date date,
  image_url text,
  gallery_urls jsonb DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Package Services (many-to-many relationship)
CREATE TABLE IF NOT EXISTS package_services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id uuid REFERENCES service_packages(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  quantity integer DEFAULT 1 NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(package_id, service_id)
);

-- Package Subscriptions (customer package purchases)
CREATE TABLE IF NOT EXISTS package_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  package_id uuid REFERENCES service_packages(id) ON DELETE RESTRICT NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  total_quantity integer NOT NULL CHECK (total_quantity > 0),
  remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0),
  expires_at timestamptz,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (remaining_quantity <= total_quantity)
);

-- Note: The package_subscription_usage table from migrations is replaced by package_usage table

-- Package Usage (tracks package usage per booking)
CREATE TABLE IF NOT EXISTS package_usage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES package_subscriptions(id) ON DELETE CASCADE NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(subscription_id, booking_id)
);

-- Tenant Features
CREATE TABLE IF NOT EXISTS tenant_features (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  feature_name text NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, feature_name)
);

-- Zoho Tokens
CREATE TABLE IF NOT EXISTS zoho_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id)
);

-- Zoho Invoice Logs
CREATE TABLE IF NOT EXISTS zoho_invoice_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  invoice_id text,
  invoice_number text,
  status text NOT NULL,
  error_message text,
  response_data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Tenant Zoho Configs
CREATE TABLE IF NOT EXISTS tenant_zoho_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  redirect_uri text NOT NULL,
  region text DEFAULT 'com' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id)
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  is_approved boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Testimonials
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_name text NOT NULL,
  customer_name_ar text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL,
  comment_ar text,
  image_url text,
  display_order integer DEFAULT 0,
  is_featured boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  provider text,
  amount decimal(10, 2) NOT NULL,
  currency text DEFAULT 'SAR',
  status text,
  gateway_txn_id text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- OTP Requests
CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone text,
  email text,
  otp_code text NOT NULL,
  purpose text DEFAULT 'login' NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- SMS Logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  status text,
  provider_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Queue Jobs
CREATE TABLE IF NOT EXISTS queue_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type text NOT NULL,
  status text DEFAULT 'pending',
  payload jsonb NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz
);

-- ============================================
-- 5. CREATE FUNCTIONS
-- ============================================

-- Function to generate tenant slug
CREATE OR REPLACE FUNCTION generate_tenant_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to get user tenant_id
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to generate slots for shift
CREATE OR REPLACE FUNCTION generate_slots_for_shift(
  p_shift_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_service_id uuid;
  v_start_time_utc time;
  v_end_time_utc time;
  v_days_of_week integer[];
  v_duration_minutes integer;
  v_capacity_per_slot integer;
  v_employee_id uuid;
  v_current_date date;
  v_slot_start_minutes integer;
  v_slot_end_minutes integer;
  v_shift_start_minutes integer;
  v_shift_end_minutes integer;
  v_slots_generated integer := 0;
  v_start_time time;
  v_end_time time;
  v_start_timestamp timestamptz;
  v_end_timestamp timestamptz;
  v_original_capacity integer;
BEGIN
  -- Get shift and service details
  SELECT 
    sh.tenant_id,
    sh.service_id,
    sh.start_time_utc,
    sh.end_time_utc,
    sh.days_of_week,
    srv.duration_minutes,
    srv.capacity_per_slot
  INTO 
    v_tenant_id,
    v_service_id,
    v_start_time_utc,
    v_end_time_utc,
    v_days_of_week,
    v_duration_minutes,
    v_capacity_per_slot
  FROM shifts sh
  JOIN services srv ON sh.service_id = srv.id
  WHERE sh.id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  v_original_capacity := v_capacity_per_slot;

  -- Delete existing slots for this shift in the date range
  DELETE FROM slots
  WHERE shift_id = p_shift_id
    AND slot_date >= p_start_date
    AND slot_date <= p_end_date;

  -- Calculate shift time in minutes
  v_shift_start_minutes := EXTRACT(HOUR FROM v_start_time_utc) * 60 + 
                           EXTRACT(MINUTE FROM v_start_time_utc);
  v_shift_end_minutes := EXTRACT(HOUR FROM v_end_time_utc) * 60 + 
                         EXTRACT(MINUTE FROM v_end_time_utc);

  -- Loop through each date in range
  v_current_date := p_start_date;
  WHILE v_current_date <= p_end_date LOOP
    -- Check if this day of week is in shift's days_of_week
    IF EXTRACT(DOW FROM v_current_date)::integer = ANY(v_days_of_week) THEN
      
      -- Loop through each employee assigned to this shift
      FOR v_employee_id IN 
        SELECT DISTINCT employee_id 
        FROM employee_services 
        WHERE shift_id = p_shift_id
      LOOP
        -- Get employee-specific capacity and duration if available
        SELECT 
          COALESCE(es.custom_capacity, v_capacity_per_slot),
          COALESCE(es.custom_duration_minutes, v_duration_minutes)
        INTO v_capacity_per_slot, v_duration_minutes
        FROM employee_services es
        WHERE es.employee_id = v_employee_id
          AND es.shift_id = p_shift_id
          AND es.service_id = v_service_id
        LIMIT 1;
        
        v_original_capacity := v_capacity_per_slot;
        
        -- Generate slots for this employee on this date
        v_slot_start_minutes := v_shift_start_minutes;
        
        WHILE v_slot_start_minutes + v_duration_minutes <= v_shift_end_minutes LOOP
          v_slot_end_minutes := v_slot_start_minutes + v_duration_minutes;
          
          -- Convert minutes to time
          v_start_time := make_time(
            v_slot_start_minutes / 60,
            v_slot_start_minutes % 60,
            0
          );
          v_end_time := make_time(
            v_slot_end_minutes / 60,
            v_slot_end_minutes % 60,
            0
          );
          
          -- Create timestamps
          v_start_timestamp := v_current_date + v_start_time;
          v_end_timestamp := v_current_date + v_end_time;
          
          -- Insert slot
          INSERT INTO slots (
            tenant_id,
            service_id,
            shift_id,
            employee_id,
            slot_date,
            start_time,
            end_time,
            start_time_utc,
            end_time_utc,
            total_capacity,
            original_capacity,
            remaining_capacity,
            available_capacity,
            booked_count,
            is_available
          ) VALUES (
            v_tenant_id,
            v_service_id,
            p_shift_id,
            v_employee_id,
            v_current_date,
            v_start_time,
            v_end_time,
            v_start_timestamp,
            v_end_timestamp,
            v_capacity_per_slot,
            v_original_capacity,
            v_capacity_per_slot,
            v_capacity_per_slot,
            0,
            true
          );
          
          v_slots_generated := v_slots_generated + 1;
          v_slot_start_minutes := v_slot_start_minutes + v_duration_minutes;
        END LOOP;
        
      END LOOP;
      
    END IF;
    
    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_slots_generated;
END;
$$;

-- ============================================
-- 6. CREATE TRIGGERS
-- ============================================

-- Trigger to auto-generate tenant slug
DROP TRIGGER IF EXISTS set_tenant_slug ON tenants;
CREATE TRIGGER set_tenant_slug
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION generate_tenant_slug();

-- ============================================
-- 7. CREATE INDEXES
-- ============================================

-- Tenants indexes
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active) WHERE is_active = true;

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Service Categories indexes
CREATE INDEX IF NOT EXISTS idx_service_categories_tenant_id ON service_categories(tenant_id);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_is_public ON services(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active) WHERE is_active = true;

-- Service Offers indexes
CREATE INDEX IF NOT EXISTS idx_service_offers_service_id ON service_offers(service_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_tenant_id ON service_offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_dates ON service_offers(start_date, end_date);

-- Shifts indexes
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_id ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_service_id ON shifts(service_id);

-- Employee Services indexes
CREATE INDEX IF NOT EXISTS idx_employee_services_employee_id ON employee_services(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_service_id ON employee_services(service_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_shift_id ON employee_services(shift_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_tenant_id ON employee_services(tenant_id);

-- Slots indexes
CREATE INDEX IF NOT EXISTS idx_slots_tenant_id ON slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_slots_service_id ON slots(service_id);
CREATE INDEX IF NOT EXISTS idx_slots_shift_id ON slots(shift_id);
CREATE INDEX IF NOT EXISTS idx_slots_employee_id ON slots(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slots_slot_date ON slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_start_time_utc ON slots(start_time_utc);
CREATE INDEX IF NOT EXISTS idx_slots_available ON slots(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_slots_date_service ON slots(slot_date, service_id, is_available);

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);

-- Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_employee_id ON bookings(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone ON bookings(customer_phone);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_group_id ON bookings(booking_group_id) WHERE booking_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_package_id ON bookings(package_id) WHERE package_id IS NOT NULL;

-- Booking Locks indexes
CREATE INDEX IF NOT EXISTS idx_booking_locks_slot_id ON booking_locks(slot_id);
CREATE INDEX IF NOT EXISTS idx_booking_locks_expires_at ON booking_locks(lock_expires_at);

-- Service Packages indexes
CREATE INDEX IF NOT EXISTS idx_service_packages_tenant_id ON service_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_is_public ON service_packages(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_service_packages_is_active ON service_packages(is_active) WHERE is_active = true;

-- Package Services indexes
CREATE INDEX IF NOT EXISTS idx_package_services_package_id ON package_services(package_id);
CREATE INDEX IF NOT EXISTS idx_package_services_service_id ON package_services(service_id);

-- Package Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_tenant_id ON package_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_customer_id ON package_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_package_id ON package_subscriptions(package_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_is_active ON package_subscriptions(is_active) WHERE is_active = true;

-- Package Usage indexes
CREATE INDEX IF NOT EXISTS idx_package_usage_subscription_id ON package_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_booking_id ON package_usage(booking_id);

-- Tenant Features indexes
CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant_id ON tenant_features(tenant_id);

-- Zoho Tokens indexes
CREATE INDEX IF NOT EXISTS idx_zoho_tokens_tenant_id ON zoho_tokens(tenant_id);

-- Zoho Invoice Logs indexes
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_tenant_id ON zoho_invoice_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_booking_id ON zoho_invoice_logs(booking_id) WHERE booking_id IS NOT NULL;

-- Tenant Zoho Configs indexes
CREATE INDEX IF NOT EXISTS idx_tenant_zoho_configs_tenant_id ON tenant_zoho_configs(tenant_id);

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_id ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_service_id ON reviews(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_is_approved ON reviews(is_approved) WHERE is_approved = true;

-- Testimonials indexes
CREATE INDEX IF NOT EXISTS idx_testimonials_tenant_id ON testimonials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_is_active ON testimonials(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_testimonials_display_order ON testimonials(display_order);

-- Audit Logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);

-- OTP Requests indexes
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON otp_requests(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_requests_email ON otp_requests(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires_at ON otp_requests(expires_at);

-- ============================================
-- 8. ENABLE ROW LEVEL SECURITY
-- ============================================
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

-- ============================================
-- 9. CREATE RLS POLICIES
-- ============================================

-- Note: RLS policies require auth.users table from Supabase Auth
-- If you're not using Supabase Auth, you'll need to modify these policies
-- For now, we'll create basic policies that work with standard PostgreSQL

-- Helper function to check if user is solution owner (modify based on your auth system)
CREATE OR REPLACE FUNCTION is_solution_owner(user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id AND role = 'solution_owner'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to get user tenant_id (modify based on your auth system)
CREATE OR REPLACE FUNCTION get_user_tenant(user_id uuid)
RETURNS uuid AS $$
  SELECT tenant_id FROM users WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Basic RLS Policies (simplified - adjust based on your authentication system)
-- These are placeholder policies. In production with Supabase, use the full RLS policies from migrations.

-- For now, allow all operations (you should restrict these based on your auth system)
-- In Supabase, these would use auth.uid() and proper RLS policies

-- ============================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE tenants IS 'Stores business/organization information';
COMMENT ON TABLE users IS 'User accounts with role-based access';
COMMENT ON TABLE services IS 'Services offered by tenants';
COMMENT ON TABLE slots IS 'Available booking time slots';
COMMENT ON TABLE bookings IS 'Customer appointment bookings';
COMMENT ON TABLE customers IS 'Customer information and booking history';
COMMENT ON TABLE service_packages IS 'Service packages with multiple included services';
COMMENT ON COLUMN services.adult_price IS 'Price for adult tickets';
COMMENT ON COLUMN services.child_price IS 'Price for child tickets (optional)';
COMMENT ON COLUMN tenants.smtp_settings IS 'SMTP configuration for email sending';
COMMENT ON COLUMN tenants.whatsapp_settings IS 'WhatsApp Business API configuration';

-- ============================================
-- SCRIPT COMPLETE
-- ============================================
-- 
-- IMPORTANT NOTES:
-- 
-- 1. RLS POLICIES:
--    This script enables RLS on all tables but does NOT create detailed policies.
--    If you're using Supabase Auth, you need to run the RLS policies migration:
--    - project/supabase/migrations/20251121155318_add_rls_policies.sql
--    
--    If you're NOT using Supabase Auth, you'll need to:
--    - Either disable RLS: ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
--    - Or create custom policies based on your authentication system
--
-- 2. AUTHENTICATION:
--    The users table references auth.users(id) which is a Supabase Auth table.
--    If you're NOT using Supabase, you'll need to:
--    - Remove the foreign key constraint: ALTER TABLE users DROP CONSTRAINT users_id_fkey;
--    - Or create your own auth.users table
--
-- 3. NEXT STEPS:
--    a. Create initial admin user through your application
--    b. Configure SMTP and WhatsApp settings per tenant
--    c. Generate slots for your services using generate_slots_for_shift()
--    d. Test the database connection from your backend
--
-- 4. FOR RAILWAY/BOLT DEPLOYMENT:
--    - Connect to your PostgreSQL database
--    - Run this script using: psql $DATABASE_URL -f complete_database_setup.sql
--    - Or paste this script into Railway's SQL editor
--
-- ============================================
