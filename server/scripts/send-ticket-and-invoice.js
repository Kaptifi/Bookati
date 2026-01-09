/**
 * Script to manually send ticket and invoice for a booking
 * This helps diagnose email sending issues
 */

import pg from 'pg';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Import will be done dynamically since we're in a script
// const { generateBookingTicketPDFBase64 } = await import('../src/services/pdfService.js');
// const { zohoService } = await import('../src/services/zohoService.js');

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

// Get booking ID from command line or use most recent
const bookingId = process.argv[2] || null;

async function sendTicketAndInvoice() {
  const client = await pool.connect();
  try {
    console.log('📧 Sending Ticket and Invoice\n');
    console.log('='.repeat(60));
    
    // Get booking
    let query, params;
    if (bookingId) {
      query = `SELECT * FROM bookings WHERE id = $1`;
      params = [bookingId];
    } else {
      query = `SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1`;
      params = [];
    }
    
    const bookingResult = await client.query(query, params);
    
    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }
    
    const booking = bookingResult.rows[0];
    
    console.log(`Booking ID: ${booking.id}`);
    console.log(`Customer: ${booking.customer_name}`);
    console.log(`Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
    console.log(`Payment Status: ${booking.payment_status}`);
    console.log(`Zoho Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
    console.log('');
    
    if (!booking.customer_email) {
      console.log('❌ No email provided. Cannot send email.');
      return;
    }
    
    // Step 1: Send Ticket via Email
    console.log('📧 Step 1: Sending Ticket via Email...');
    try {
      const { generateBookingTicketPDFBase64 } = await import('../src/services/pdfService.js');
      const pdfBase64 = await generateBookingTicketPDFBase64(booking.id, 'en');
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
        },
      };
      
      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        console.log('❌ Email configuration missing');
        console.log(`   SMTP_USER: ${emailConfig.auth.user ? 'SET' : 'NOT SET'}`);
        console.log(`   SMTP_PASSWORD: ${emailConfig.auth.pass ? 'SET' : 'NOT SET'}`);
        return;
      }
      
      const transporter = nodemailer.createTransport(emailConfig);
      
      // Verify connection
      console.log('   Verifying SMTP connection...');
      await transporter.verify();
      console.log('   ✅ SMTP connection verified');
      
      // Send email
      const mailResult = await transporter.sendMail({
        from: emailConfig.auth.user,
        to: booking.customer_email,
        subject: 'Your Booking Ticket',
        text: 'Your booking is confirmed! Please find your ticket attached.',
        html: '<p>Your booking is confirmed! Please find your ticket attached.</p>',
        attachments: [{
          filename: `booking_ticket_${booking.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });
      
      console.log(`✅ Ticket sent via email to ${booking.customer_email}`);
      console.log(`   Message ID: ${mailResult.messageId}`);
      console.log(`   Response: ${mailResult.response}`);
      
    } catch (emailError) {
      console.error('❌ Failed to send ticket via email:');
      console.error(`   ${emailError.message}`);
      if (emailError.code) {
        console.error(`   Code: ${emailError.code}`);
      }
      if (emailError.response) {
        console.error(`   Response: ${emailError.response}`);
      }
    }
    
    // Step 2: Create and Send Invoice (if payment is paid)
    console.log('\n📧 Step 2: Checking Invoice...');
    
    if (booking.payment_status !== 'paid') {
      console.log(`⚠️  Payment status is '${booking.payment_status}'`);
      console.log('   Invoice will only be created when payment_status = "paid"');
      console.log('   To create invoice, update payment status first:');
      console.log(`   PATCH /api/bookings/${booking.id}/payment-status`);
      console.log(`   { "payment_status": "paid" }`);
    } else if (booking.zoho_invoice_id) {
      console.log(`✅ Invoice already exists: ${booking.zoho_invoice_id}`);
      console.log('   Invoice should have been sent via Zoho when created.');
    } else {
      console.log('📧 Creating invoice...');
      try {
        const { zohoService } = await import('../src/services/zohoService.js');
        const result = await zohoService.generateReceipt(booking.id);
        if (result.success) {
          console.log(`✅ Invoice created and sent: ${result.invoiceId}`);
        } else {
          console.error(`❌ Failed to create invoice: ${result.error}`);
        }
      } catch (invoiceError) {
        console.error('❌ Error creating invoice:');
        console.error(`   ${invoiceError.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

sendTicketAndInvoice();

