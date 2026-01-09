/*
  # Create tenant-specific Zoho configuration table
  
  This allows each tenant to have their own Zoho OAuth credentials,
  enabling multi-tenant SaaS architecture where each service provider
  connects their own Zoho Invoice account.
  
  1. New table: tenant_zoho_configs
    - Stores OAuth credentials per tenant
    - Encrypted client_secret (application-level encryption recommended)
    - Supports different Zoho regions
    - Tracks active/inactive status
  
  2. Security
    - Unique constraint on tenant_id (one config per tenant)
    - Foreign key to tenants table with CASCADE delete
    - Indexes for fast lookups
*/

CREATE TABLE IF NOT EXISTS tenant_zoho_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id VARCHAR(255) NOT NULL,
  client_secret VARCHAR(255) NOT NULL,
  redirect_uri VARCHAR(500) DEFAULT 'http://localhost:3001/api/zoho/callback',
  scopes TEXT[] DEFAULT ARRAY[
    'ZohoInvoice.invoices.CREATE',
    'ZohoInvoice.invoices.READ',
    'ZohoInvoice.contacts.CREATE',
    'ZohoInvoice.contacts.READ'
  ],
  region VARCHAR(50) DEFAULT 'com',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_zoho_configs_tenant_id ON tenant_zoho_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_zoho_configs_active ON tenant_zoho_configs(tenant_id, is_active);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_tenant_zoho_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_zoho_configs_updated_at
  BEFORE UPDATE ON tenant_zoho_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_zoho_configs_updated_at();

-- Add comment
COMMENT ON TABLE tenant_zoho_configs IS 'Stores Zoho OAuth credentials per tenant for multi-tenant SaaS architecture';
COMMENT ON COLUMN tenant_zoho_configs.client_secret IS 'Should be encrypted at application level before storage';
COMMENT ON COLUMN tenant_zoho_configs.region IS 'Zoho region: com, eu, in, au, jp, etc.';

