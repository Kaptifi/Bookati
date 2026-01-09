/*
  # Create Service Offers System

  ## Overview
  Creates a system for service offers (similar to Dubai Tickets) where each service
  can have multiple offers (e.g., Basic, Fast Track, VIP) that customers must choose from.

  ## Changes
  - Create `service_offers` table for storing offers
  - Add `offer_id` column to `bookings` table to track selected offer
  - Add indexes for performance
*/

-- Create service_offers table
CREATE TABLE IF NOT EXISTS service_offers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  original_price numeric(10, 2), -- For discount pricing
  discount_percentage integer, -- 0-100
  duration_minutes integer, -- Override service duration if different
  perks jsonb DEFAULT '[]'::jsonb, -- Array of perks/features
  perks_ar jsonb DEFAULT '[]'::jsonb, -- Arabic perks
  badge text, -- e.g., "Most Popular", "Best Value", "Fast Track"
  badge_ar text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true NOT NULL,
  closing_time time, -- e.g., "11:30pm", "12:00am"
  meeting_point text,
  meeting_point_ar text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add offer_id to bookings table
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES service_offers(id) ON DELETE SET NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_offers_service_id ON service_offers(service_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_tenant_id ON service_offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_is_active ON service_offers(is_active);
CREATE INDEX IF NOT EXISTS idx_bookings_offer_id ON bookings(offer_id);

-- Add comments
COMMENT ON TABLE service_offers IS 'Offers/variants for services (e.g., Basic, Fast Track, VIP)';
COMMENT ON COLUMN service_offers.perks IS 'Array of perks/features for this offer (e.g., ["Fast-track entry", "Access to telescopes"])';
COMMENT ON COLUMN service_offers.badge IS 'Badge text to display (e.g., "Most Popular", "Best Value")';
COMMENT ON COLUMN service_offers.closing_time IS 'Closing time for this offer (e.g., "11:30pm")';
COMMENT ON COLUMN bookings.offer_id IS 'References the selected offer for this booking. NULL means basic service was selected.';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_offers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_service_offers_updated_at ON service_offers;
CREATE TRIGGER trigger_update_service_offers_updated_at
  BEFORE UPDATE ON service_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_service_offers_updated_at();




