/*
  # Bookati Database Schema Setup
  
  1. New Tables
    - `tenants` - Stores business/organization information
      - `id` (uuid, primary key)
      - `name` (text) - Business name
      - `industry` (text) - Business type
      - `contact_email`, `contact_phone` - Contact info
      - `subscription_start`, `subscription_end` - Subscription period
      - `is_active` (boolean) - Active status
      - `public_page_enabled` (boolean) - Public booking page toggle
      - Theme and branding settings
      
    - `users` - User profiles linked to auth.users
      - `id` (uuid, primary key, references auth.users)
      - `tenant_id` (uuid, references tenants)
      - `email`, `phone`, `full_name`
      - `role` (enum: solution_owner, tenant_admin, receptionist, cashier, employee)
      - `is_active` (boolean)
      
    - `service_categories` - Service groupings
    - `services` - Services offered by tenants
    - `shifts` - Operating hours/schedules
    - `time_slots` - Available booking slots
    - `bookings` - Customer bookings
    - `booking_locks` - Prevents double booking
    - `audit_logs` - System activity tracking
    - `payments`, `otp_requests`, `sms_logs`, `queue_jobs` - Future features
    
  2. Security
    - Enable RLS on all tables
    - Policies will be added in next migration
    
  3. Indexes
    - Performance indexes on frequently queried columns
    - Composite indexes for common query patterns
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid_manual', 'awaiting_payment', 'paid', 'refunded');
CREATE TYPE user_role AS ENUM ('solution_owner', 'tenant_admin', 'receptionist', 'cashier', 'employee');

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
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
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  full_name text NOT NULL,
  role user_role NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(email)
);

-- Service Categories
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  base_price decimal(10, 2) NOT NULL CHECK (base_price >= 0),
  capacity_per_slot integer DEFAULT 1 NOT NULL CHECK (capacity_per_slot > 0),
  is_public boolean DEFAULT false NOT NULL,
  assigned_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  image_url text,
  gallery_urls jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
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

-- Time Slots
CREATE TABLE IF NOT EXISTS time_slots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
  start_time_utc timestamptz NOT NULL,
  end_time_utc timestamptz NOT NULL,
  total_capacity integer NOT NULL CHECK (total_capacity > 0),
  remaining_capacity integer NOT NULL CHECK (remaining_capacity >= 0),
  is_available boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (remaining_capacity <= total_capacity)
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE RESTRICT NOT NULL,
  slot_id uuid REFERENCES time_slots(id) ON DELETE RESTRICT NOT NULL,
  employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  visitor_count integer DEFAULT 1 NOT NULL CHECK (visitor_count > 0),
  total_price decimal(10, 2) NOT NULL CHECK (total_price >= 0),
  status booking_status DEFAULT 'pending' NOT NULL,
  payment_status payment_status DEFAULT 'unpaid' NOT NULL,
  notes text,
  qr_token text,
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
  slot_id uuid REFERENCES time_slots(id) ON DELETE CASCADE NOT NULL,
  reserved_by_session_id text NOT NULL,
  reserved_capacity integer DEFAULT 1 NOT NULL CHECK (reserved_capacity > 0),
  lock_acquired_at timestamptz DEFAULT now() NOT NULL,
  lock_expires_at timestamptz NOT NULL
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

-- Future tables (Phase 2)
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

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  status text,
  provider_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_service_categories_tenant_id ON service_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_is_public ON services(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_id ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_service_id ON shifts(service_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_tenant_id ON time_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_service_id ON time_slots(service_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_start_time ON time_slots(start_time_utc);
CREATE INDEX IF NOT EXISTS idx_time_slots_available ON time_slots(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone ON bookings(customer_phone);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_locks_slot_id ON booking_locks(slot_id);
CREATE INDEX IF NOT EXISTS idx_booking_locks_expires_at ON booking_locks(lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_jobs ENABLE ROW LEVEL SECURITY;
