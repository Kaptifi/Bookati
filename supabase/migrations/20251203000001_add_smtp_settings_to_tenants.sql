/*
  # Add SMTP Settings to Tenants Table
  
  1. Changes
    - Add `smtp_settings` (jsonb) column to tenants table
    - This stores SMTP configuration for email sending (host, port, user, password)
    
  2. Notes
    - Column is nullable to support tenants who haven't configured SMTP yet
    - Settings include: smtp_host, smtp_port, smtp_user, smtp_password
    - Password is stored encrypted/hashed in production (for now, stored as-is for development)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'smtp_settings'
  ) THEN
    ALTER TABLE tenants ADD COLUMN smtp_settings jsonb DEFAULT NULL;
    
    COMMENT ON COLUMN tenants.smtp_settings IS 'SMTP configuration for email sending: {smtp_host, smtp_port, smtp_user, smtp_password}';
  END IF;
END $$;

