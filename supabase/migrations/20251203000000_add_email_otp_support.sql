-- Add email column to otp_requests (if not exists)
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'password_reset'; -- 'password_reset', 'login', etc.

-- Update constraint: either phone or email must be provided
ALTER TABLE otp_requests DROP CONSTRAINT IF EXISTS otp_requests_phone_or_email_check;
ALTER TABLE otp_requests ADD CONSTRAINT otp_requests_phone_or_email_check 
  CHECK ((phone IS NOT NULL) OR (email IS NOT NULL));

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_otp_requests_email ON otp_requests(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_requests_email_purpose ON otp_requests(email, purpose, verified, expires_at) 
  WHERE email IS NOT NULL;

-- Add comment
COMMENT ON COLUMN otp_requests.email IS 'Email address for email-based OTP requests';
COMMENT ON COLUMN otp_requests.purpose IS 'Purpose of OTP: password_reset, login, etc.';

