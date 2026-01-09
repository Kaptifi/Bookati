/*
  # Align Database Schema with Complete Setup - Structure Only

  1. Schema Updates
    - Rename time_slots table to slots
    - Add missing columns to existing tables
    - Create missing tables
    - Update enums
    - Add indexes and constraints

  2. New Tables Created
    - customers, reviews, testimonials
    - service_packages, package_services, package_subscriptions, package_usage
    - service_offers, employee_services, tenant_features
    - zoho_tokens, zoho_invoice_logs, tenant_zoho_configs
*/

-- ============================================
-- 1. UPDATE ENUMS
-- ============================================

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS smtp_settings jsonb DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_settings jsonb DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS landing_page_settings jsonb DEFAULT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name_ar text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS name_ar text NOT NULL DEFAULT '';
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS description_ar text;

ALTER TABLE services ADD COLUMN IF NOT EXISTS name_ar text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS adult_price numeric(10, 2);
ALTER TABLE services ADD COLUMN IF NOT EXISTS child_price numeric(10, 2);
ALTER TABLE services ADD COLUMN IF NOT EXISTS discount_percentage numeric(5, 2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS discount_start_date date;
ALTER TABLE services ADD COLUMN IF NOT EXISTS discount_end_date date;
ALTER TABLE services ADD COLUMN IF NOT EXISTS what_to_expect jsonb DEFAULT '[]'::jsonb;

UPDATE services SET adult_price = base_price WHERE adult_price IS NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adult_count integer DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS child_count integer DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS qr_scanned boolean DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS qr_scanned_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS qr_scanned_by_user_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS zoho_invoice_id text;

ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'login';

-- ============================================
-- 3. RENAME time_slots TO slots
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'time_slots')
     AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'slots')
  THEN
    ALTER TABLE time_slots RENAME TO slots;
    ALTER INDEX IF EXISTS idx_time_slots_tenant_id RENAME TO idx_slots_tenant_id;
    ALTER INDEX IF EXISTS idx_time_slots_service_id RENAME TO idx_slots_service_id;
    ALTER INDEX IF EXISTS idx_time_slots_shift_id RENAME TO idx_slots_shift_id;
  END IF;
END $$;

ALTER TABLE slots ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS slot_date date;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS original_capacity integer;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS available_capacity integer;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS booked_count integer DEFAULT 0;

UPDATE slots SET slot_date = start_time_utc::date WHERE slot_date IS NULL;
UPDATE slots SET start_time = start_time_utc::time WHERE start_time IS NULL;
UPDATE slots SET end_time = end_time_utc::time WHERE end_time IS NULL;
UPDATE slots SET original_capacity = total_capacity WHERE original_capacity IS NULL;
UPDATE slots SET available_capacity = remaining_capacity WHERE available_capacity IS NULL;

-- ============================================
-- 4. CREATE NEW TABLES
-- ============================================

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

CREATE TABLE IF NOT EXISTS package_services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id uuid REFERENCES service_packages(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  quantity integer DEFAULT 1 NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(package_id, service_id)
);

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

CREATE TABLE IF NOT EXISTS package_usage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES package_subscriptions(id) ON DELETE CASCADE NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(subscription_id, booking_id)
);

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

-- ============================================
-- 5. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_employee_services_employee_id ON employee_services(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_service_id ON employee_services(service_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_shift_id ON employee_services(shift_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_tenant_id ON employee_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_tenant_id ON service_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_is_public ON service_packages(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_service_packages_is_active ON service_packages(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_package_services_package_id ON package_services(package_id);
CREATE INDEX IF NOT EXISTS idx_package_services_service_id ON package_services(service_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_tenant_id ON package_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_customer_id ON package_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_package_id ON package_subscriptions(package_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_is_active ON package_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_package_usage_subscription_id ON package_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_booking_id ON package_usage(booking_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_service_id ON service_offers(service_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_tenant_id ON service_offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_dates ON service_offers(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant_id ON tenant_features(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_tokens_tenant_id ON zoho_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_tenant_id ON zoho_invoice_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_booking_id ON zoho_invoice_logs(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_zoho_configs_tenant_id ON tenant_zoho_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_id ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_service_id ON reviews(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_is_approved ON reviews(is_approved) WHERE is_approved = true;
CREATE INDEX IF NOT EXISTS idx_testimonials_tenant_id ON testimonials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_is_active ON testimonials(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_testimonials_display_order ON testimonials(display_order);
CREATE INDEX IF NOT EXISTS idx_slots_employee_id ON slots(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slots_slot_date ON slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_date_service ON slots(slot_date, service_id, is_available);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_group_id ON bookings(booking_group_id) WHERE booking_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_package_id ON bookings(package_id) WHERE package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id) WHERE customer_id IS NOT NULL;

-- ============================================
-- 6. ADD FOREIGN KEY CONSTRAINTS
-- ============================================

DO $$ BEGIN
  ALTER TABLE slots ADD CONSTRAINT slots_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_package_id_fkey
    FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_qr_scanned_by_user_id_fkey
    FOREIGN KEY (qr_scanned_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- 7. ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_invoice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_zoho_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;