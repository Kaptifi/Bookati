-- Create zoho_invoice_logs table for tracking invoice creation attempts
CREATE TABLE IF NOT EXISTS zoho_invoice_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  zoho_invoice_id text,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_message text,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_booking_id ON zoho_invoice_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_tenant_id ON zoho_invoice_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_status ON zoho_invoice_logs(status);
CREATE INDEX IF NOT EXISTS idx_zoho_invoice_logs_created_at ON zoho_invoice_logs(created_at);

-- Add RLS policies
ALTER TABLE zoho_invoice_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for their tenant
CREATE POLICY "Users can view Zoho invoice logs for their tenant"
  ON zoho_invoice_logs
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Solution owner can view all logs
CREATE POLICY "Solution owner can view all Zoho invoice logs"
  ON zoho_invoice_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'solution_owner'
    )
  );

