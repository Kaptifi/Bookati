-- Make phone column nullable in otp_requests table
-- This allows storing OTPs for email-based authentication (where phone is null)

-- Remove NOT NULL constraint from phone column if it exists
ALTER TABLE otp_requests ALTER COLUMN phone DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN otp_requests.phone IS 'Phone number for phone/WhatsApp-based OTP requests. Can be null for email-based OTPs.';

