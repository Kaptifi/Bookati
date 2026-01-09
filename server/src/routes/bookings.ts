import express from 'express';
import { query, pool } from '../db';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Normalize phone number to international format
 * Handles Egyptian numbers specially: +2001032560826 -> +201032560826 (removes leading 0 after +20)
 * @param phone - Phone number in any format
 * @returns Normalized phone number in E.164 format or null if invalid
 */
function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // If already in international format with +
  if (cleaned.startsWith('+')) {
    // Special handling for Egypt: +2001032560826 -> +201032560826
    if (cleaned.startsWith('+20')) {
      const afterCode = cleaned.substring(3); // Get number after +20
      // If starts with 0, remove it (Egyptian numbers: +2001032560826 -> +201032560826)
      if (afterCode.startsWith('0') && afterCode.length >= 10) {
        const withoutZero = afterCode.substring(1);
        // Validate it's a valid Egyptian mobile number (starts with 1, 2, or 5)
        if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
          return `+20${withoutZero}`;
        }
      }
      // If already correct format (+201032560826), return as is
      return cleaned;
    }
    // For other countries, return as is
    return cleaned;
  }

  // If starts with 00, replace with +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
    // Apply Egypt normalization if needed
    if (cleaned.startsWith('+20')) {
      const afterCode = cleaned.substring(3);
      if (afterCode.startsWith('0') && afterCode.length >= 10) {
        const withoutZero = afterCode.substring(1);
        if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
          return `+20${withoutZero}`;
        }
      }
    }
    return cleaned;
  }

  // Egyptian numbers: 01XXXXXXXX (11 digits) -> +201XXXXXXXX
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const withoutZero = cleaned.substring(1);
    if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
      return `+20${withoutZero}`;
    }
  }

  // If starts with 20 (country code without +), add +
  if (cleaned.startsWith('20') && cleaned.length >= 12) {
    // Check if it has leading 0 after 20 (2001032560826 -> 201032560826)
    const afterCode = cleaned.substring(2);
    if (afterCode.startsWith('0') && afterCode.length >= 10) {
      const withoutZero = afterCode.substring(1);
      if (withoutZero.startsWith('1') || withoutZero.startsWith('2') || withoutZero.startsWith('5')) {
        return `+20${withoutZero}`;
      }
    }
    return `+${cleaned}`;
  }

  // If it's 10 digits starting with 1, 2, or 5 (Egyptian mobile without 0), add +20
  if (cleaned.length === 10 && (cleaned.startsWith('1') || cleaned.startsWith('2') || cleaned.startsWith('5'))) {
    return `+20${cleaned}`;
  }

  // Return null if we can't determine the format
  return null;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        tenant_id?: string;
      };
    }
  }
}

// Middleware to authenticate (optional - for logged-in users)
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        tenant_id: decoded.tenant_id,
      };
    }
    next();
  } catch (error) {
    // Continue without auth for public bookings
    next();
  }
}

// ============================================================================
// Acquire booking lock (called when user proceeds to checkout)
// ============================================================================
router.post('/lock', authenticate, async (req, res) => {
  try {
    const { slot_id, reserved_capacity = 1 } = req.body;
    
    if (!slot_id) {
      return res.status(400).json({ error: 'slot_id is required' });
    }

    if (!reserved_capacity || reserved_capacity < 1) {
      return res.status(400).json({ error: 'reserved_capacity must be at least 1' });
    }

    // Generate session ID (use user ID if logged in, otherwise generate unique session)
    const sessionId = req.user?.id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Call database function to acquire lock atomically
    const result = await query(
      `SELECT acquire_booking_lock($1, $2, $3, 120) as lock_id`,
      [slot_id, sessionId, reserved_capacity]
    );

    const lockId = result.rows[0].lock_id;

    if (!lockId) {
      return res.status(500).json({ error: 'Failed to acquire lock' });
    }

    // Get lock expiration time
    const lockInfo = await query(
      `SELECT lock_expires_at FROM booking_locks WHERE id = $1`,
      [lockId]
    );

    res.json({
      lock_id: lockId,
      session_id: sessionId,
      reserved_capacity,
      expires_at: lockInfo.rows[0].lock_expires_at,
      expires_in_seconds: 120
    });
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Lock acquisition error', error, context, {
      slot_id: req.body.slot_id,
      reserved_capacity: req.body.reserved_capacity,
    });
    
    // Handle specific error cases
    if (error.message.includes('not available') || 
        error.message.includes('already locked') ||
        error.message.includes('Not enough tickets')) {
      return res.status(409).json({ 
        error: error.message || 'Slot is not available or already locked' 
      });
    }
    
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ============================================================================
// Validate lock is still active (called periodically during checkout)
// ============================================================================
router.get('/lock/:lock_id/validate', authenticate, async (req, res) => {
  try {
    const { lock_id } = req.params;
    const sessionId = req.user?.id || req.query.session_id as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'session_id required' });
    }

    const result = await query(
      `SELECT validate_booking_lock($1, $2) as is_valid`,
      [lock_id, sessionId]
    );

    const isValid = result.rows[0].is_valid;

    if (!isValid) {
      return res.status(409).json({ 
        valid: false,
        error: 'Lock expired or invalid. These tickets are no longer available.' 
      });
    }

    // Get remaining time
    const lockInfo = await query(
      `SELECT lock_expires_at, 
              EXTRACT(EPOCH FROM (lock_expires_at - now()))::integer as seconds_remaining
       FROM booking_locks 
       WHERE id = $1`,
      [lock_id]
    );

    if (lockInfo.rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Lock not found' });
    }

    res.json({
      valid: true,
      expires_at: lockInfo.rows[0].lock_expires_at,
      seconds_remaining: Math.max(0, lockInfo.rows[0].seconds_remaining)
    });
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Validate lock error', error, context, {
      lock_id: req.params.lock_id,
    });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Release lock (if user abandons checkout)
// ============================================================================
router.post('/lock/:lock_id/release', authenticate, async (req, res) => {
  try {
    const { lock_id } = req.params;
    const sessionId = req.user?.id || req.body.session_id;

    if (!sessionId) {
      return res.status(400).json({ error: 'session_id required' });
    }

    const result = await query(
      `DELETE FROM booking_locks 
       WHERE id = $1 AND reserved_by_session_id = $2 
       RETURNING id`,
      [lock_id, sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lock not found or does not belong to session' });
    }

    res.json({ message: 'Lock released successfully' });
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Release lock error', error, context, {
      lock_id: req.params.lock_id,
    });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Create booking with lock validation
// ============================================================================
router.post('/create', authenticate, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      slot_id,
      service_id,
      tenant_id,
      customer_name,
      customer_phone,
      customer_email,
      visitor_count = 1,
      adult_count,
      child_count,
      total_price,
      notes,
      employee_id,
      lock_id,
      session_id,
      offer_id, // Optional: ID of selected service offer
      language = 'en' // Customer preferred language ('en' or 'ar')
    } = req.body;

    // Validate language
    const validLanguage = (language === 'ar' || language === 'en') ? language : 'en';

    // Validate required fields
    if (!slot_id || !service_id || !tenant_id || !customer_name || !customer_phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize phone number (handles Egyptian numbers: +2001032560826 -> +201032560826)
    const normalizedPhone = normalizePhoneNumber(customer_phone);
    if (!normalizedPhone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if tenant account is active
    const tenantCheck = await client.query(
      'SELECT is_active FROM tenants WHERE id = $1',
      [tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service provider not found' });
    }

    if (tenantCheck.rows[0].is_active === false) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This service provider account has been deactivated. Bookings are not available.' });
    }

    // If lock_id provided, validate lock is still valid
    if (lock_id) {
      const expectedSessionId = req.user?.id || session_id;
      
      if (!expectedSessionId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'session_id required when using lock' });
      }

      const lockCheck = await client.query(
        `SELECT id, slot_id, reserved_by_session_id, reserved_capacity, lock_expires_at 
         FROM booking_locks 
         WHERE id = $1 AND lock_expires_at > now()`,
        [lock_id]
      );

      if (lockCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: 'Booking lock expired or invalid. These tickets are no longer available. Please choose another option.' 
        });
      }

      const lock = lockCheck.rows[0];
      
      // Verify session matches
      if (lock.reserved_by_session_id !== expectedSessionId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Lock belongs to different session' });
      }

      // Verify slot matches
      if (lock.slot_id !== slot_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Lock does not match slot' });
      }

      // Verify quantity matches
      if (lock.reserved_capacity !== visitor_count) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Lock quantity does not match booking quantity' });
      }
    }

    // Check slot availability (with row lock to prevent race conditions)
    const slotCheck = await client.query(
      `SELECT available_capacity, is_available 
       FROM slots 
       WHERE id = $1 
       FOR UPDATE`,
      [slot_id]
    );

    if (slotCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Slot not found' });
    }

    const slot = slotCheck.rows[0];

    if (!slot.is_available) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Slot is not available' });
    }

    // Check capacity (considering lock if present)
    if (slot.available_capacity < visitor_count) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: `Not enough tickets available. Only ${slot.available_capacity} available, but ${visitor_count} requested.` 
      });
    }

    // Validate offer_id if provided
    if (offer_id) {
      const offerCheck = await client.query(
        `SELECT id, service_id, price FROM service_offers WHERE id = $1 AND is_active = true`,
        [offer_id]
      );
      
      if (offerCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Service offer not found or inactive' });
      }
      
      const offer = offerCheck.rows[0];
      if (offer.service_id !== service_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Offer does not belong to selected service' });
      }
    }

    // Calculate adult_count and child_count if not provided (backward compatibility)
    const finalAdultCount = adult_count !== undefined ? adult_count : visitor_count;
    const finalChildCount = child_count !== undefined ? child_count : 0;
    
    // Ensure visitor_count matches adult_count + child_count
    const calculatedVisitorCount = finalAdultCount + finalChildCount;
    if (calculatedVisitorCount !== visitor_count) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `visitor_count (${visitor_count}) must equal adult_count (${finalAdultCount}) + child_count (${finalChildCount})` 
      });
    }

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        tenant_id, service_id, slot_id, employee_id,
        customer_name, customer_phone, customer_email,
        visitor_count, adult_count, child_count, total_price, notes, status, payment_status,
        customer_id, offer_id, language
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        tenant_id,
        service_id,
        slot_id,
        employee_id || null,
        customer_name,
        normalizedPhone,
        customer_email || null,
        visitor_count,
        finalAdultCount,
        finalChildCount,
        total_price,
        notes || null,
        'confirmed',
        'unpaid', // Default payment status (payment methods not implemented yet)
        req.user?.id || null,
        offer_id || null,
        validLanguage
      ]
    );

    // Delete lock if it was used (lock is consumed by booking)
    if (lock_id) {
      await client.query(
        `DELETE FROM booking_locks WHERE id = $1`,
        [lock_id]
      );
    }

    await client.query('COMMIT');
    
    const booking = bookingResult.rows[0];
    
    // Automatically create invoice after booking is created
    // This runs asynchronously so it doesn't block the booking response
    // Invoice is created for ALL bookings with email OR phone
    // Delivery: Email (if email provided), WhatsApp (if phone provided), or both
    // Note: Payment status is not used - invoices are created for all bookings
    if (normalizedPhone || customer_phone || customer_email) {
      process.nextTick(async () => {
        try {
          console.log(`[Booking Creation] 🧾 Invoice Flow Started for booking ${booking.id}`);
          console.log(`[Booking Creation] 📋 Flow: Booking Confirmed → Create Invoice → Send via Email/WhatsApp`);
          console.log(`[Booking Creation]    Customer Email: ${customer_email || 'NOT PROVIDED'}`);
          console.log(`[Booking Creation]    Customer Phone: ${normalizedPhone || customer_phone || 'NOT PROVIDED'}`);
          const { zohoService } = await import('../services/zohoService.js');
          
          // Follow the exact invoice flow:
          // 1. Booking Confirmed ✓ (already done)
          // 2. Create Invoice in Zoho Invoice
          // 3. Send via Email (if email provided)
          // 4. Download PDF and Send via WhatsApp (if phone provided)
          const invoiceResult = await zohoService.generateReceipt(booking.id);
          if (invoiceResult.success) {
            console.log(`[Booking Creation] ✅ Invoice created automatically: ${invoiceResult.invoiceId}`);
            console.log(`[Booking Creation]    Email delivery: ${customer_email ? 'WILL ATTEMPT' : 'SKIPPED (no email)'}`);
            console.log(`[Booking Creation]    WhatsApp delivery: ${(normalizedPhone || customer_phone) ? 'WILL ATTEMPT' : 'SKIPPED (no phone)'}`);
          } else {
            console.error(`[Booking Creation] ⚠️ Invoice creation failed: ${invoiceResult.error}`);
            console.error(`[Booking Creation]    This may be due to Zoho connection issues. Check server logs for details.`);
          }
        } catch (invoiceError: any) {
          console.error(`[Booking Creation] ⚠️ Error creating invoice (non-blocking):`, invoiceError.message);
          console.error(`[Booking Creation]    Error stack:`, invoiceError.stack);
          // Don't fail booking if invoice creation fails
        }
      });
    } else {
      console.log(`[Booking Creation] ⚠️ Invoice not created (no customer email or phone provided)`);
      console.log(`[Booking Creation]    At least one contact method (email or phone) is required for invoice delivery`);
    }
    
    // Generate and send ticket PDF asynchronously (don't block response)
    // Use process.nextTick to ensure it runs after the response is sent
    process.nextTick(async () => {
      let pdfBuffer: Buffer | null = null;
      
      try {
        console.log(`\n📧 ========================================`);
        console.log(`📧 Starting ticket generation for booking ${booking.id}...`);
        console.log(`   Customer: ${customer_name}`);
        console.log(`   Email: ${customer_email || 'not provided'}`);
        console.log(`   Phone: ${normalizedPhone || customer_phone || 'not provided'}`);
        console.log(`📧 ========================================\n`);
        
        // Import required modules
        const { generateBookingTicketPDFBase64 } = await import('../services/pdfService.js');
        const { sendWhatsAppDocument } = await import('../services/whatsappService.js');
        const nodemailer = await import('nodemailer');
        
        // Get language from booking (stored when booking was created)
        const language = (booking.language === 'ar' || booking.language === 'en') 
          ? booking.language as 'en' | 'ar'
          : 'en';
        
        console.log(`📄 Language for ticket: ${language} (from booking.language: ${booking.language})`);
        
        // Generate PDF
        console.log(`📄 Step 1: Generating PDF for booking ${booking.id}...`);
        const pdfBase64 = await generateBookingTicketPDFBase64(booking.id, language);
        
        if (!pdfBase64 || pdfBase64.length === 0) {
          console.error('❌ Failed to generate PDF - pdfBase64 is empty or null');
          return;
        }
        
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
        if (!pdfBuffer || pdfBuffer.length === 0) {
          console.error('❌ Failed to convert PDF base64 to buffer - buffer is empty');
          return;
        }
        
        console.log(`✅ Step 1 Complete: PDF generated successfully (${pdfBuffer.length} bytes)`);
        
        // Get tenant WhatsApp settings
        console.log(`📱 Step 2a: Fetching WhatsApp configuration...`);
        const tenantResult = await query(
          'SELECT whatsapp_settings FROM tenants WHERE id = $1',
          [tenant_id]
        );
        
        let whatsappConfig: any = null;
        if (tenantResult.rows.length > 0 && tenantResult.rows[0].whatsapp_settings) {
          const settings = tenantResult.rows[0].whatsapp_settings;
          whatsappConfig = {
            provider: settings.provider,
            apiUrl: settings.api_url,
            apiKey: settings.api_key,
            phoneNumberId: settings.phone_number_id,
            accessToken: settings.access_token,
            accountSid: settings.account_sid,
            authToken: settings.auth_token,
            from: settings.from,
          };
          console.log(`   ✅ WhatsApp config from tenant: provider=${whatsappConfig.provider || 'not set'}`);
        } else {
          console.log(`   ⚠️ No WhatsApp config in tenant settings, will use environment variables if available`);
        }
        
        // Also check for default config from environment
        if (process.env.WHATSAPP_PROVIDER) {
          console.log(`   ℹ️ Default WhatsApp config from env: provider=${process.env.WHATSAPP_PROVIDER}`);
        } else {
          console.log(`   ⚠️ No WhatsApp config in environment variables`);
        }
        
        // Send PDF via WhatsApp if phone number is provided (for all users, not just guests)
        if (customer_phone && pdfBuffer) {
          const phoneToUse = normalizedPhone || customer_phone;
          console.log(`📱 Step 2: Attempting to send ticket via WhatsApp to ${phoneToUse}...`);
          try {
            const whatsappResult = await sendWhatsAppDocument(
              phoneToUse,
              pdfBuffer,
              `booking_ticket_${booking.id}.pdf`,
              language === 'ar' 
                ? 'تم تأكيد حجزك! يرجى الاطلاع على التذكرة المرفقة.'
                : 'Your booking is confirmed! Please find your ticket attached.',
              whatsappConfig || undefined
            );
            
            if (whatsappResult && whatsappResult.success) {
              console.log(`✅ Step 2 Complete: Ticket PDF sent via WhatsApp to ${phoneToUse}`);
            } else {
              console.error(`❌ Step 2 Failed: Could not send PDF via WhatsApp to ${phoneToUse}`);
              console.error(`   Error: ${whatsappResult?.error || 'Unknown error'}`);
              console.error('   WhatsApp config check:', {
                hasConfig: !!whatsappConfig,
                provider: whatsappConfig?.provider || 'not set',
                hasAccessToken: !!whatsappConfig?.accessToken,
                hasPhoneNumberId: !!whatsappConfig?.phoneNumberId,
                envProvider: process.env.WHATSAPP_PROVIDER || 'not set',
                envAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ? 'SET' : 'NOT SET'
              });
            }
          } catch (whatsappError: any) {
            console.error('❌ Step 2 Exception: Error sending PDF via WhatsApp:', whatsappError);
            console.error('   WhatsApp error details:', {
              phone: phoneToUse,
              error: whatsappError.message,
              name: whatsappError.name,
              stack: whatsappError.stack
            });
            // Continue - don't fail booking if WhatsApp fails
          }
        } else {
          if (!customer_phone) {
            console.log('⚠️ Step 2 Skipped: No phone number provided - skipping WhatsApp send');
          } else {
            console.log('⚠️ Step 2 Skipped: PDF buffer is null - cannot send via WhatsApp');
          }
        }
        
        // Send PDF via Email if email is provided (for all users, not just logged-in)
        if (customer_email && pdfBuffer) {
          console.log(`📧 Step 3: Attempting to send ticket via Email to ${customer_email}...`);
          try {
            // Get email configuration from tenant or use defaults
            // Note: Using SMTP_PASSWORD (not SMTP_PASS) to match emailService.ts
              const emailConfig = {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS, // Support both for compatibility
                },
                tls: {
                  // Do not fail on invalid certificates (for development/testing)
                  rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
                },
              };
            
            console.log(`   Email config: host=${emailConfig.host}, port=${emailConfig.port}, user=${emailConfig.auth.user ? 'SET' : 'NOT SET'}, pass=${emailConfig.auth.pass ? 'SET' : 'NOT SET'}`);
            
            if (emailConfig.auth.user && emailConfig.auth.pass) {
              const transporter = nodemailer.default.createTransport(emailConfig);
              
              // Verify connection before sending
              try {
                await transporter.verify();
                console.log(`   ✅ SMTP connection verified`);
              } catch (verifyError: any) {
                console.error(`   ⚠️ SMTP verification failed: ${verifyError.message}`);
                // Continue anyway - sometimes verification fails but sending works
              }
              
              const mailResult = await transporter.sendMail({
                from: emailConfig.auth.user,
                to: customer_email,
                subject: language === 'ar' ? 'تذكرة الحجز - Booking Ticket' : 'Booking Ticket',
                text: language === 'ar' 
                  ? 'تم تأكيد حجزك! يرجى الاطلاع على التذكرة المرفقة.'
                  : 'Your booking is confirmed! Please find your ticket attached.',
                html: language === 'ar'
                  ? '<p>تم تأكيد حجزك! يرجى الاطلاع على التذكرة المرفقة.</p>'
                  : '<p>Your booking is confirmed! Please find your ticket attached.</p>',
                attachments: [{
                  filename: `booking_ticket_${booking.id}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                }],
              });
              
              console.log(`✅ Step 3 Complete: Ticket PDF sent via Email to ${customer_email}`);
              console.log(`   Message ID: ${mailResult.messageId}`);
            } else {
              console.warn('⚠️ Step 3 Skipped: Email configuration missing.');
              console.warn('   SMTP_USER:', emailConfig.auth.user ? 'SET' : 'NOT SET');
              console.warn('   SMTP_PASSWORD:', emailConfig.auth.pass ? 'SET' : 'NOT SET');
              console.warn('   Please set SMTP_USER and SMTP_PASSWORD in environment variables.');
              console.warn('   (Note: SMTP_PASS is also supported for backward compatibility)');
            }
          } catch (emailError: any) {
            console.error('❌ Step 3 Exception: Failed to send PDF via Email:', emailError);
            console.error('   Email error details:', {
              email: customer_email,
              error: emailError.message,
              code: emailError.code,
              command: emailError.command,
              response: emailError.response,
              responseCode: emailError.responseCode,
              stack: emailError.stack
            });
            // Continue - don't fail booking if email fails
          }
        } else {
          if (!customer_email) {
            console.log('⚠️ Step 3 Skipped: No email provided - skipping Email send');
          } else {
            console.log('⚠️ Step 3 Skipped: PDF buffer is null - cannot send via Email');
          }
        }
        
        // Log final status
        console.log(`\n📧 ========================================`);
        if (!customer_email && !customer_phone) {
          console.warn(`⚠️ No email or phone provided for booking ${booking.id}. Ticket not sent.`);
        } else {
          console.log(`✅ Ticket sending process completed for booking ${booking.id}`);
        }
        console.log(`📧 ========================================\n`);
      } catch (pdfError: any) {
        console.error('\n❌ ========================================');
        console.error('❌ CRITICAL ERROR: Failed to generate/send ticket PDF');
        console.error('❌ ========================================');
        console.error('PDF error details:', {
          bookingId: booking.id,
          customerName: customer_name,
          customerEmail: customer_email || 'not provided',
          customerPhone: customer_phone || 'not provided',
          error: pdfError.message,
          name: pdfError.name,
          stack: pdfError.stack
        });
        console.error('❌ ========================================\n');
        // Don't fail booking if PDF generation fails, but log the error clearly
      }
    });
    
    res.status(201).json({ booking });
  } catch (error: any) {
    await client.query('ROLLBACK');
    const context = logger.extractContext(req);
    logger.error('Create booking error', error, context, {
      slot_id: req.body.slot_id,
      service_id: req.body.service_id,
      tenant_id: req.body.tenant_id,
      lock_id: req.body.lock_id,
    });
    res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    client.release();
  }
});

// ============================================================================
// Validate QR code (for cashiers/receptionists)
// ============================================================================
router.post('/validate-qr', authenticate, async (req, res) => {
  try {
    const { booking_id } = req.body;
    const userId = req.user?.id;

    if (!booking_id) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check user role (cashier or receptionist)
    const userResult = await query(
      'SELECT role, tenant_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.role !== 'cashier' && user.role !== 'receptionist' && user.role !== 'tenant_admin') {
      return res.status(403).json({ error: 'Only cashiers, receptionists, and admins can validate QR codes' });
    }

    // Get booking details
    const bookingResult = await query(
      `SELECT 
        b.id, b.tenant_id, b.customer_name, b.customer_phone,
        ts.slot_date, ts.start_time, ts.end_time,
        b.visitor_count, b.adult_count, b.child_count, b.total_price,
        b.qr_scanned, b.qr_scanned_at, b.qr_scanned_by_user_id,
        b.status, b.payment_status,
        s.name as service_name, s.name_ar as service_name_ar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN slots ts ON b.slot_id = ts.id
      WHERE b.id = $1`,
      [booking_id]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];

    // Check if booking belongs to same tenant
    if (booking.tenant_id !== user.tenant_id) {
      return res.status(403).json({ error: 'Booking does not belong to your tenant' });
    }

    // Check if QR already scanned
    if (booking.qr_scanned) {
      return res.status(409).json({
        error: 'QR code has already been scanned',
        booking: {
          id: booking.id,
          customer_name: booking.customer_name,
          qr_scanned_at: booking.qr_scanned_at,
          qr_scanned_by_user_id: booking.qr_scanned_by_user_id,
        },
      });
    }

    // Mark QR as scanned
    await query(
      `UPDATE bookings 
       SET qr_scanned = true, 
           qr_scanned_at = now(), 
           qr_scanned_by_user_id = $1,
           status = 'checked_in',
           checked_in_at = now(),
           checked_in_by_user_id = $1
       WHERE id = $2`,
      [userId, booking_id]
    );

    res.json({
      success: true,
      message: 'QR code validated successfully',
      booking: {
        id: booking.id,
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        service_name: booking.service_name,
        service_name_ar: booking.service_name_ar,
        slot_date: booking.slot_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        visitor_count: booking.visitor_count,
        adult_count: booking.adult_count,
        child_count: booking.child_count,
        total_price: booking.total_price,
        status: 'checked_in',
        payment_status: booking.payment_status,
        qr_scanned: true,
        qr_scanned_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('QR validation error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ============================================================================
// Get active locks for slots (for frontend to filter unavailable slots)
// Supports both GET (for backward compatibility) and POST (for large requests)
// ============================================================================
router.get('/locks', async (req, res) => {
  try {
    const { slot_ids } = req.query;
    
    if (!slot_ids) {
      return res.status(400).json({ error: 'slot_ids required (comma-separated)' });
    }

    const slotIdArray = (slot_ids as string).split(',').filter(id => id.trim());
    
    if (slotIdArray.length === 0) {
      return res.json([]);
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of slotIdArray) {
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: `Invalid UUID format: ${id}` });
      }
    }

    // Use PostgreSQL array format - pass as array and let pg handle conversion
    const result = await query(
      `SELECT slot_id, lock_expires_at 
       FROM booking_locks
       WHERE slot_id = ANY($1::uuid[])
         AND lock_expires_at > now()`,
      [slotIdArray]
    );

    res.json(result.rows);
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Get locks error', error, context, {
      slot_ids: req.query.slot_ids,
    });
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST endpoint for large requests (avoids 431 error)
router.post('/locks', async (req, res) => {
  try {
    const { slot_ids } = req.body;
    
    if (!slot_ids) {
      return res.status(400).json({ error: 'slot_ids required (array or comma-separated string)' });
    }

    // Handle both array and comma-separated string
    const slotIdArray = Array.isArray(slot_ids) 
      ? slot_ids.filter(id => id && id.trim())
      : (slot_ids as string).split(',').filter(id => id.trim());
    
    if (slotIdArray.length === 0) {
      return res.json([]);
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of slotIdArray) {
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: `Invalid UUID format: ${id}` });
      }
    }

    // Use PostgreSQL array format
    const result = await query(
      `SELECT slot_id, lock_expires_at 
       FROM booking_locks
       WHERE slot_id = ANY($1::uuid[])
         AND lock_expires_at > now()`,
      [slotIdArray]
    );

    res.json(result.rows);
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Post locks error', error, context, {
      slot_ids_count: Array.isArray(req.body.slot_ids) ? req.body.slot_ids.length : 'unknown',
    });
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================================================
// Update payment status (triggers Zoho receipt generation if status = 'paid')
// ============================================================================
router.patch('/:id/payment-status', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const bookingId = req.params.id;
    const { payment_status } = req.body;
    const userId = req.user?.id;

    if (!payment_status) {
      return res.status(400).json({ error: 'payment_status is required' });
    }

    // Validate payment status
    const validStatuses = ['unpaid', 'paid', 'paid_manual', 'awaiting_payment', 'refunded'];
    if (!validStatuses.includes(payment_status)) {
      return res.status(400).json({ 
        error: `Invalid payment_status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Check if booking exists and user has permission
    const bookingCheck = await client.query(
      `SELECT b.*, u.tenant_id as user_tenant_id, u.role
       FROM bookings b
       LEFT JOIN users u ON u.id = $1
       WHERE b.id = $2`,
      [userId, bookingId]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingCheck.rows[0];

    // Check permissions (tenant admin, receptionist, or cashier can update)
    if (booking.user_tenant_id !== booking.tenant_id && booking.role !== 'solution_owner') {
      return res.status(403).json({ error: 'You do not have permission to update this booking' });
    }

    // Update payment status
    // The database trigger will automatically queue Zoho receipt generation if status = 'paid'
    await client.query(
      `UPDATE bookings 
       SET payment_status = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [payment_status, bookingId]
    );

    const updatedBooking = await client.query(
      `SELECT * FROM bookings WHERE id = $1`,
      [bookingId]
    );

    res.json({
      success: true,
      booking: updatedBooking.rows[0],
      message: payment_status === 'paid' 
        ? 'Payment status updated. Receipt generation queued.' 
        : 'Payment status updated',
    });
  } catch (error: any) {
    const context = logger.extractContext(req);
    logger.error('Update payment status error', error, context, {
      booking_id: req.params.id,
      payment_status: req.body.payment_status,
    });
    res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    client.release();
  }
});

export { router as bookingRoutes };

