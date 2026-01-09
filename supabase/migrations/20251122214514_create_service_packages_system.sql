/*
  # Create Service Packages System

  1. New Tables
    - `service_packages`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `name` (text) - Package name in English
      - `name_ar` (text) - Package name in Arabic
      - `description` (text, nullable) - Description in English
      - `description_ar` (text, nullable) - Description in Arabic
      - `total_price` (decimal) - Total package price
      - `is_active` (boolean) - Whether package is available for subscription
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `package_services`
      - `id` (uuid, primary key)
      - `package_id` (uuid, foreign key to service_packages)
      - `service_id` (uuid, foreign key to services)
      - `quantity` (integer) - Number of bookings included for this service
      - `created_at` (timestamptz)
    
    - `package_subscriptions`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `customer_id` (uuid, foreign key to customers)
      - `package_id` (uuid, foreign key to service_packages)
      - `status` (text) - active, expired, cancelled
      - `subscribed_at` (timestamptz) - When subscription started
      - `expires_at` (timestamptz, nullable) - When subscription expires (null = no expiry)
      - `created_at` (timestamptz)
    
    - `package_subscription_usage`
      - `id` (uuid, primary key)
      - `subscription_id` (uuid, foreign key to package_subscriptions)
      - `service_id` (uuid, foreign key to services)
      - `original_quantity` (integer) - Original quantity from package
      - `remaining_quantity` (integer) - Bookings remaining
      - `used_quantity` (integer) - Bookings used
      - `updated_at` (timestamptz)

  2. Schema Changes
    - Add `package_subscription_id` to `bookings` table to track package-based bookings

  3. Security
    - Enable RLS on all new tables
    - Add policies for tenant-based access control
    - Ensure users can only access packages within their tenant

  4. Indexes
    - Add indexes on foreign keys for performance
    - Add index on customer_id and status for fast subscription lookups
    - Add unique constraint on (subscription_id, service_id) for usage tracking

  5. Triggers
    - Auto-update updated_at timestamps
    - Prevent negative remaining_quantity values
*/

-- Create service_packages table
CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text NOT NULL,
  description text,
  description_ar text,
  total_price decimal(10,2) NOT NULL CHECK (total_price >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_packages_tenant_id ON service_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_active ON service_packages(tenant_id, is_active);

-- Create package_services junction table
CREATE TABLE IF NOT EXISTS package_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(package_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_package_services_package_id ON package_services(package_id);
CREATE INDEX IF NOT EXISTS idx_package_services_service_id ON package_services(service_id);

-- Create package_subscriptions table
CREATE TABLE IF NOT EXISTS package_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES service_packages(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  subscribed_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_subscriptions_customer ON package_subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_tenant ON package_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_subscriptions_package ON package_subscriptions(package_id);

-- Create package_subscription_usage table
CREATE TABLE IF NOT EXISTS package_subscription_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES package_subscriptions(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  original_quantity integer NOT NULL CHECK (original_quantity > 0),
  remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0),
  used_quantity integer NOT NULL DEFAULT 0 CHECK (used_quantity >= 0),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, service_id),
  CHECK (original_quantity = remaining_quantity + used_quantity)
);

CREATE INDEX IF NOT EXISTS idx_package_usage_subscription ON package_subscription_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_service ON package_subscription_usage(service_id);

-- Add package_subscription_id to bookings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'package_subscription_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN package_subscription_id uuid REFERENCES package_subscriptions(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bookings_package_subscription ON bookings(package_subscription_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_subscription_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_packages
CREATE POLICY "Users can view packages in their tenant"
  ON service_packages FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can insert packages"
  ON service_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "Tenant admins can update packages"
  ON service_packages FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "Tenant admins can delete packages"
  ON service_packages FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- RLS Policies for package_services
CREATE POLICY "Users can view package services in their tenant"
  ON package_services FOR SELECT
  TO authenticated
  USING (
    package_id IN (
      SELECT id FROM service_packages WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Tenant admins can manage package services"
  ON package_services FOR ALL
  TO authenticated
  USING (
    package_id IN (
      SELECT id FROM service_packages WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
      )
    )
  )
  WITH CHECK (
    package_id IN (
      SELECT id FROM service_packages WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
      )
    )
  );

-- RLS Policies for package_subscriptions
CREATE POLICY "Users can view subscriptions in their tenant"
  ON package_subscriptions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert subscriptions in their tenant"
  ON package_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update subscriptions in their tenant"
  ON package_subscriptions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- RLS Policies for package_subscription_usage
CREATE POLICY "Users can view usage in their tenant"
  ON package_subscription_usage FOR SELECT
  TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM package_subscriptions WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update usage in their tenant"
  ON package_subscription_usage FOR UPDATE
  TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM package_subscriptions WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    subscription_id IN (
      SELECT id FROM package_subscriptions WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert usage in their tenant"
  ON package_subscription_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    subscription_id IN (
      SELECT id FROM package_subscriptions WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Trigger to update updated_at on service_packages
CREATE OR REPLACE FUNCTION update_service_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_packages_updated_at
  BEFORE UPDATE ON service_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_service_packages_updated_at();

-- Trigger to update updated_at on package_subscription_usage
CREATE OR REPLACE FUNCTION update_package_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER package_usage_updated_at
  BEFORE UPDATE ON package_subscription_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_package_usage_updated_at();

-- Function to initialize usage records when subscription is created
CREATE OR REPLACE FUNCTION initialize_package_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert usage records for all services in the package
  INSERT INTO package_subscription_usage (subscription_id, service_id, original_quantity, remaining_quantity, used_quantity)
  SELECT 
    NEW.id,
    ps.service_id,
    ps.quantity,
    ps.quantity,
    0
  FROM package_services ps
  WHERE ps.package_id = NEW.package_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER initialize_subscription_usage
  AFTER INSERT ON package_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION initialize_package_usage();
