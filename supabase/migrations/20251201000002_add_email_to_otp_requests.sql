-- Add email column to otp_requests table
-- This allows storing OTPs for both email and phone-based authentication

-- Add email column if it doesn't exist
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS email text;

-- Add index for better query performance on email
CREATE INDEX IF NOT EXISTS idx_otp_requests_email ON otp_requests(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_requests_email_purpose ON otp_requests(email, purpose, verified, expires_at) 
  WHERE email IS NOT NULL;

-- Add comment
COMMENT ON COLUMN otp_requests.email IS 'Email address for email-based OTP requests';

