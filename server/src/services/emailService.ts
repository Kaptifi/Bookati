import nodemailer from 'nodemailer';
import { query } from '../db';

/**
 * Get SMTP settings from database for a tenant
 * Returns null if settings not found or incomplete
 */
async function getSmtpSettingsFromDb(tenantId: string): Promise<{
  host: string;
  port: number;
  user: string;
  password: string;
} | null> {
  try {
    if (!tenantId || tenantId.trim() === '') {
      console.error(`[EmailService] ❌ Invalid tenant ID provided: "${tenantId}"`);
      console.error('   Tenant ID is required to fetch SMTP settings from database');
      return null;
    }

    const result = await query(
      'SELECT smtp_settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      console.error(`[EmailService] ❌ Tenant ${tenantId} not found in database`);
      return null;
    }

    const smtpSettings = result.rows[0].smtp_settings;
    
    if (!smtpSettings) {
      console.error(`[EmailService] ❌ SMTP settings not configured for tenant ${tenantId}`);
      console.error('   Please configure SMTP settings in the service provider settings page');
      return null;
    }

    if (!smtpSettings.smtp_user || !smtpSettings.smtp_password) {
      console.error(`[EmailService] ❌ SMTP settings incomplete for tenant ${tenantId}`);
      console.error(`   smtp_user: ${smtpSettings.smtp_user ? 'SET ✅' : 'NOT SET ❌'}`);
      console.error(`   smtp_password: ${smtpSettings.smtp_password ? 'SET ✅' : 'NOT SET ❌'}`);
      console.error('   Please configure SMTP settings in the service provider settings page');
      return null;
    }

    return {
      host: smtpSettings.smtp_host || 'smtp.gmail.com',
      port: smtpSettings.smtp_port || 587,
      user: smtpSettings.smtp_user,
      password: smtpSettings.smtp_password?.replace(/\s/g, '') || smtpSettings.smtp_password, // Remove spaces (Gmail app passwords)
    };
  } catch (error: any) {
    console.error(`[EmailService] Error fetching SMTP settings for tenant ${tenantId}:`, error.message);
    return null;
  }
}

/**
 * Create SMTP transporter from database settings
 */
async function createTransporterFromDb(tenantId: string): Promise<nodemailer.Transporter | null> {
  const smtpSettings = await getSmtpSettingsFromDb(tenantId);
  
  if (!smtpSettings) {
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpSettings.user,
        pass: smtpSettings.password,
      },
      tls: {
        // Do not fail on invalid certificates (for development)
        rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
      },
    });
    
    console.log(`[EmailService] ✅ SMTP transporter created for tenant ${tenantId}`);
    return transporter;
  } catch (error: any) {
    console.error(`[EmailService] ❌ Failed to create SMTP transporter:`, error.message);
    return null;
  }
}

export async function sendOTPEmail(email: string, otp: string, tenantId: string, language: 'en' | 'ar' = 'en') {
  const subject = language === 'ar' 
    ? 'رمز التحقق لإعادة تعيين كلمة المرور'
    : 'Password Reset OTP Code';
  
  const html = language === 'ar' 
    ? `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">رمز التحقق لإعادة تعيين كلمة المرور</h2>
        <p>مرحباً،</p>
        <p>لقد طلبت إعادة تعيين كلمة المرور. استخدم الرمز التالي للتحقق:</p>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; border: 2px solid #2563eb;">
          ${otp}
        </div>
        <p style="color: #666;">هذا الرمز صالح لمدة 10 دقائق فقط.</p>
        <p style="color: #666;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">شكراً لك،<br>فريق Bookati</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Password Reset OTP Code</h2>
        <p>Hello,</p>
        <p>You have requested to reset your password. Use the following code to verify:</p>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; border: 2px solid #2563eb;">
          ${otp}
        </div>
        <p style="color: #666;">This code is valid for 10 minutes only.</p>
        <p style="color: #666;">If you did not request a password reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Thank you,<br>The Bookati Team</p>
      </div>
    `;

  // Get SMTP settings from database
  const smtpSettings = await getSmtpSettingsFromDb(tenantId);
  
  if (!smtpSettings) {
    console.error(`[EmailService] ❌ SMTP settings not configured for tenant ${tenantId}`);
    console.error('   Please configure SMTP settings in the service provider settings page.');
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   OTP for ${email}: ${otp} (check server console)`);
    }
    return { success: false, error: 'Email service not configured' };
  }

  // Create transporter from database settings
  const transporter = await createTransporterFromDb(tenantId);
  
  if (!transporter) {
    console.error(`[EmailService] ❌ Failed to create SMTP transporter for tenant ${tenantId}`);
    return { success: false, error: 'Failed to create email transporter' };
  }

  try {
    const mailOptions = {
      from: `"Bookati" <${smtpSettings.user}>`,
      to: email,
      subject,
      html,
    };
    
    console.log(`[EmailService] 📧 Attempting to send email:`);
    console.log(`   From: ${mailOptions.from}`);
    console.log(`   To: ${mailOptions.to}`);
    console.log(`   Subject: ${mailOptions.subject}`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✅ OTP email sent successfully to ${email}`);
    console.log(`   Message ID: ${info.messageId}`);
    return { success: true };
  } catch (error: any) {
    console.error('[EmailService] ❌ Email sending error:', error);
    console.error('   Error code:', error.code);
    console.error('   Error command:', error.command);
    console.error('   Error response:', error.response);
    return { success: false, error: error.message };
  }
}

/**
 * Send booking ticket PDF via email
 * Uses SMTP settings from database (tenant-specific)
 */
export async function sendBookingTicketEmail(
  email: string,
  pdfBuffer: Buffer,
  bookingId: string,
  tenantId: string,
  bookingDetails: {
    service_name: string;
    service_name_ar?: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    tenant_name?: string;
    tenant_name_ar?: string;
  },
  language: 'en' | 'ar' = 'en',
  allTicketBuffers?: Buffer[] // Optional: Array of all ticket PDFs for multiple attachments
): Promise<{ success: boolean; error?: string }> {
  const subject = language === 'ar' 
    ? 'تذكرة الحجز - Booking Ticket'
    : 'Booking Ticket';
  
  const html = language === 'ar'
    ? `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">تم تأكيد حجزك!</h2>
        <p>شكراً لك على حجزك. يرجى الاطلاع على التذكرة المرفقة.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p><strong>تفاصيل الحجز:</strong></p>
        <ul>
          <li>رقم الحجز: ${bookingId}</li>
          <li>الخدمة: ${bookingDetails.service_name_ar || bookingDetails.service_name}</li>
          <li>التاريخ: ${bookingDetails.slot_date}</li>
          <li>الوقت: ${bookingDetails.start_time} - ${bookingDetails.end_time}</li>
        </ul>
        <p>يرجى إحضار هذه التذكرة عند الوصول.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">شكراً لك،<br>${bookingDetails.tenant_name_ar || bookingDetails.tenant_name || 'فريق Bookati'}</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Your booking is confirmed!</h2>
        <p>Thank you for your booking. Please find your ticket attached.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Booking ID: ${bookingId}</li>
          <li>Service: ${bookingDetails.service_name_ar || bookingDetails.service_name}</li>
          <li>Date: ${bookingDetails.slot_date}</li>
          <li>Time: ${bookingDetails.start_time} - ${bookingDetails.end_time}</li>
        </ul>
        <p>Please bring this ticket upon arrival.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Thank you,<br>${bookingDetails.tenant_name || 'The Bookati Team'}</p>
      </div>
    `;

  // Get SMTP settings from database
  const smtpSettings = await getSmtpSettingsFromDb(tenantId);
  
  if (!smtpSettings) {
    console.error(`[EmailService] ❌ SMTP settings not configured for tenant ${tenantId}`);
    console.error('   Please configure SMTP settings in the service provider settings page.');
    return { success: false, error: 'Email service not configured' };
  }

  // Create transporter from database settings
  const transporter = await createTransporterFromDb(tenantId);
  
  if (!transporter) {
    console.error(`[EmailService] ❌ Failed to create SMTP transporter for tenant ${tenantId}`);
    return { success: false, error: 'Failed to create email transporter' };
  }

  try {
    // Prepare attachments: if multiple tickets provided, attach all; otherwise attach single ticket
    const attachments = allTicketBuffers && allTicketBuffers.length > 1
      ? allTicketBuffers.map((buffer, index) => ({
          filename: `booking_ticket_${bookingId}_${index + 1}of${allTicketBuffers.length}.pdf`,
          content: buffer,
          contentType: 'application/pdf',
        }))
      : [{
          filename: `booking_ticket_${bookingId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }];
    
    const mailOptions = {
      from: `"${bookingDetails.tenant_name || 'Bookati'}" <${smtpSettings.user}>`,
      to: email,
      subject,
      html,
      attachments,
    };
    
    console.log(`[EmailService] 📧 Attempting to send booking ticket email:`);
    console.log(`   From: ${mailOptions.from}`);
    console.log(`   To: ${mailOptions.to}`);
    console.log(`   Subject: ${mailOptions.subject}`);
    console.log(`   Attachments: ${attachments.length} ticket(s)`);
    attachments.forEach((att, idx) => {
      console.log(`     ${idx + 1}. ${att.filename} (${(att.content.length / 1024).toFixed(2)} KB)`);
    });
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✅ Booking ticket email sent successfully to ${email}`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    return { success: true };
  } catch (error: any) {
    console.error('[EmailService] ❌ Email sending error:', error);
    console.error('   Error code:', error.code);
    console.error('   Error command:', error.command);
    console.error('   Error response:', error.response);
    return { success: false, error: error.message };
  }
}

