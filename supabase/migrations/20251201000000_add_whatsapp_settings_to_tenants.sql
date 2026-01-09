/*
  # Add WhatsApp Settings to Tenants Table
  
  1. Changes
    - Add `whatsapp_settings` (jsonb) column to tenants table
    - This stores WhatsApp Business API configuration for sending OTP messages
    - Supports multiple providers: Meta Cloud API, Twilio, WATI, etc.
    
  2. Notes
    - Column is nullable to support tenants who haven't configured WhatsApp yet
    - Settings include: provider, api_url, api_key, phone_number_id, access_token, etc.
    - Password/tokens are stored encrypted/hashed in production (for now, stored as-is for development)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'whatsapp_settings'
  ) THEN
    ALTER TABLE tenants ADD COLUMN whatsapp_settings jsonb DEFAULT NULL;
    
    COMMENT ON COLUMN tenants.whatsapp_settings IS 'WhatsApp Business API configuration for sending OTP messages: {provider, api_url, api_key, phone_number_id, access_token, account_sid, auth_token, from}';
  END IF;
END $$;

