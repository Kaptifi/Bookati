-- Create zoho_tokens table for storing OAuth tokens per tenant
CREATE TABLE IF NOT EXISTS zoho_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_zoho_tokens_tenant_id ON zoho_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_tokens_expires_at ON zoho_tokens(expires_at);

-- Add RLS policies
ALTER TABLE zoho_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Tenant admins can manage their own tokens
CREATE POLICY "Tenant admins can manage their own Zoho tokens"
  ON zoho_tokens
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- Policy: Solution owner can view all tokens
CREATE POLICY "Solution owner can view all Zoho tokens"
  ON zoho_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'solution_owner'
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_zoho_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER zoho_tokens_updated_at
  BEFORE UPDATE ON zoho_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_zoho_tokens_updated_at();

