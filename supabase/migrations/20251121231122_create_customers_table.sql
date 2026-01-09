/*
  # Create customers table for auto-complete functionality

  1. New Tables
    - `customers`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `phone` (text, unique per tenant)
      - `name` (text)
      - `email` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `last_booking_at` (timestamptz, nullable)
      - `total_bookings` (integer, default 0)
  
  2. Security
    - Enable RLS on `customers` table
    - Add policies for authenticated users to manage customers within their tenant
  
  3. Indexes
    - Add index on tenant_id and phone for fast lookups
    - Add unique constraint on (tenant_id, phone) combination
*/

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text NOT NULL,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_booking_at timestamptz,
  total_bookings integer DEFAULT 0,
  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers in their tenant"
  ON customers FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert customers in their tenant"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update customers in their tenant"
  ON customers FOR UPDATE
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

CREATE POLICY "Users can delete customers in their tenant"
  ON customers FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_customer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_updated_at();