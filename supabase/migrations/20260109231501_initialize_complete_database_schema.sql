-- Complete Database Setup for Fresh Supabase Instance

-- Step 1: Create all tables
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email text,
  phone text,
  full_name text NOT NULL,
  full_name_ar text DEFAULT '',
  username text UNIQUE,
  password_hash text,
  role user_role NOT NULL,
  capacity_per_slot integer DEFAULT 1,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  description text,
  description_ar text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS service_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  days_of_week integer[] NOT NULL,
  start_time_utc time NOT NULL,
  end_time_utc time NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (array_length(days_of_week, 1) > 0)
);

CREATE TABLE IF NOT EXISTS employee_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  custom_duration_minutes integer,
  custom_capacity integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(employee_id, service_id, shift_id)
);

CREATE TABLE IF NOT EXISTS slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS booking_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid REFERENCES slots(id) ON DELETE CASCADE NOT NULL,
  reserved_by_session_id text NOT NULL,
  reserved_capacity integer DEFAULT 1 NOT NULL CHECK (reserved_capacity > 0),
  lock_acquired_at timestamptz DEFAULT now() NOT NULL,
  lock_expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid REFERENCES service_packages(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  quantity integer DEFAULT 1 NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(package_id, service_id)
);

CREATE TABLE IF NOT EXISTS package_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES package_subscriptions(id) ON DELETE CASCADE NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(subscription_id, booking_id)
);

CREATE TABLE IF NOT EXISTS tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  feature_name text NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, feature_name)
);

CREATE TABLE IF NOT EXISTS zoho_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS zoho_invoice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  provider text,
  amount decimal(10, 2) NOT NULL,
  currency text DEFAULT 'SAR',
  status text,
  gateway_txn_id text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  email text,
  otp_code text NOT NULL,
  purpose text DEFAULT 'login' NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  status text,
  provider_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  status text DEFAULT 'pending',
  payload jsonb NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz
);