-- Add purpose column to otp_requests table if it doesn't exist
-- This migration is safe to run multiple times

-- Add purpose column with default value
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'password_reset';

-- Update existing records to have purpose = 'password_reset' if they are null
UPDATE otp_requests SET purpose = 'password_reset' WHERE purpose IS NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_otp_requests_purpose ON otp_requests(purpose) WHERE purpose IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone_purpose ON otp_requests(phone, purpose, verified, expires_at) 
  WHERE phone IS NOT NULL;

-- Add comment
COMMENT ON COLUMN otp_requests.purpose IS 'Purpose of OTP: password_reset, login, etc.';

