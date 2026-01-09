import jwt from 'jwt-simple';

const QR_SECRET = import.meta.env.VITE_QR_SECRET || 'bookati-qr-secret-key-change-in-production';
const QR_EXPIRY_HOURS = 48; // QR codes valid for 48 hours after booking time

export interface QRTokenPayload {
  booking_id: string;
  tenant_id: string;
  customer_name: string;
  booking_date_utc: string;
  generated_at_utc: string;
  expires_at_utc: string;
}

/**
 * Generate a signed QR token for a booking
 */
export function generateQRToken(payload: Omit<QRTokenPayload, 'generated_at_utc' | 'expires_at_utc'>): string {
  const now = new Date();
  const bookingDate = new Date(payload.booking_date_utc);
  const expiresAt = new Date(bookingDate.getTime() + QR_EXPIRY_HOURS * 60 * 60 * 1000);

  const fullPayload: QRTokenPayload = {
    ...payload,
    generated_at_utc: now.toISOString(),
    expires_at_utc: expiresAt.toISOString(),
  };

  return jwt.encode(fullPayload, QR_SECRET);
}

/**
 * Verify and decode a QR token
 */
export function verifyQRToken(token: string): { valid: boolean; payload?: QRTokenPayload; error?: string } {
  try {
    const payload = jwt.decode(token, QR_SECRET) as QRTokenPayload;

    // Check expiration
    const expiresAt = new Date(payload.expires_at_utc);
    if (expiresAt < new Date()) {
      return { valid: false, error: 'QR code has expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: 'Invalid QR code' };
  }
}

/**
 * Generate QR data URL (for embedding in PDF or displaying)
 */
export function getQRDataURL(token: string): string {
  // This will be used with qrcode.react component
  return token;
}
