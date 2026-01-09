/**
 * Test script to verify ticket generation and sending
 * This script tests:
 * 1. PDF generation
 * 2. Email sending (if configured)
 * 3. WhatsApp sending (if configured)
 */

// Use tsx to run TypeScript files
// This script should be run with: npx tsx scripts/test-ticket-sending.js

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Create database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Dynamic imports for TypeScript modules
let generateBookingTicketPDFBase64, sendWhatsAppDocument, nodemailer;

async function loadModules() {
  // Use tsx to import TypeScript files
  const pdfService = await import('../src/services/pdfService.ts');
  const whatsappService = await import('../src/services/whatsappService.ts');
  nodemailer = (await import('nodemailer')).default;
  
  generateBookingTicketPDFBase64 = pdfService.generateBookingTicketPDFBase64;
  sendWhatsAppDocument = whatsappService.sendWhatsAppDocument;
}

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  // Use a real booking ID from your database, or create a test booking
  bookingId: null, // Will be set from command line or use latest booking
  testEmail: 'mahmoudnzaineldeen@gmail.com',
  testPhone: '+201032560826',
};

async function testPDFGeneration(bookingId) {
  console.log('\n📄 ========================================');
  console.log('📄 TEST 1: PDF Generation');
  console.log('📄 ========================================\n');
  
  try {
    console.log(`   Testing PDF generation for booking: ${bookingId}`);
    
    const pdfBase64 = await generateBookingTicketPDFBase64(bookingId, 'en');
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      console.error('   ❌ FAILED: PDF base64 is empty');
      return false;
    }
    
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    console.log(`   ✅ SUCCESS: PDF generated (${pdfBuffer.length} bytes)`);
    console.log(`   ✅ Base64 length: ${pdfBase64.length} characters`);
    
    return true;
  } catch (error) {
    console.error('   ❌ FAILED: PDF generation error');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function testEmailSending(pdfBuffer, bookingId) {
  console.log('\n📧 ========================================');
  console.log('📧 TEST 2: Email Sending');
  console.log('📧 ========================================\n');
  
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
  
  console.log('   Email Configuration:');
  console.log(`   Host: ${emailConfig.host}`);
  console.log(`   Port: ${emailConfig.port}`);
  console.log(`   Secure: ${emailConfig.secure}`);
  console.log(`   User: ${emailConfig.auth.user ? 'SET ✅' : 'NOT SET ❌'}`);
  console.log(`   Pass: ${emailConfig.auth.pass ? 'SET ✅' : 'NOT SET ❌'}`);
  
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.log('   ⚠️ SKIPPED: Email not configured');
    return { success: false, skipped: true };
  }
  
  try {
    console.log('\n   Step 1: Creating SMTP transporter...');
    const transporter = nodemailer.createTransport(emailConfig);
    
    console.log('   Step 2: Verifying SMTP connection...');
    await transporter.verify();
    console.log('   ✅ SMTP connection verified');
    
    console.log('   Step 3: Sending test email...');
    const mailResult = await transporter.sendMail({
      from: emailConfig.auth.user,
      to: TEST_CONFIG.testEmail,
      subject: 'Test Booking Ticket',
      text: 'This is a test email for booking ticket.',
      html: '<p>This is a test email for booking ticket.</p>',
      attachments: [{
        filename: `test_booking_ticket_${bookingId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
    
    console.log('   ✅ SUCCESS: Email sent');
    console.log(`   Message ID: ${mailResult.messageId}`);
    console.log(`   To: ${TEST_CONFIG.testEmail}`);
    
    return { success: true, messageId: mailResult.messageId };
  } catch (error) {
    console.error('   ❌ FAILED: Email sending error');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Response:', error.response);
    return { success: false, error: error.message };
  }
}

async function testWhatsAppSending(pdfBuffer, bookingId) {
  console.log('\n📱 ========================================');
  console.log('📱 TEST 3: WhatsApp Sending');
  console.log('📱 ========================================\n');
  
  console.log('   WhatsApp Configuration:');
  console.log(`   Provider: ${process.env.WHATSAPP_PROVIDER || 'NOT SET ❌'}`);
  console.log(`   Access Token: ${process.env.WHATSAPP_ACCESS_TOKEN ? 'SET ✅' : 'NOT SET ❌'}`);
  console.log(`   Phone Number ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID || 'NOT SET ❌'}`);
  
  if (!process.env.WHATSAPP_PROVIDER) {
    console.log('   ⚠️ SKIPPED: WhatsApp not configured');
    return { success: false, skipped: true };
  }
  
  try {
    console.log('\n   Step 1: Sending test WhatsApp message...');
    const whatsappResult = await sendWhatsAppDocument(
      TEST_CONFIG.testPhone,
      pdfBuffer,
      `test_booking_ticket_${bookingId}.pdf`,
      'Test booking ticket',
      undefined // Use default config from environment
    );
    
    if (whatsappResult && whatsappResult.success) {
      console.log('   ✅ SUCCESS: WhatsApp message sent');
      console.log(`   To: ${TEST_CONFIG.testPhone}`);
      return { success: true };
    } else {
      console.error('   ❌ FAILED: WhatsApp sending failed');
      console.error(`   Error: ${whatsappResult?.error || 'Unknown error'}`);
      return { success: false, error: whatsappResult?.error };
    }
  } catch (error) {
    console.error('   ❌ FAILED: WhatsApp sending exception');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

async function getLatestBooking() {
  try {
    const result = await query(
      `SELECT id, customer_name, customer_email, customer_phone, visitor_count, adult_count, child_count
       FROM bookings
       ORDER BY created_at DESC
       LIMIT 1`
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching latest booking:', error);
    return null;
  }
}

async function main() {
  console.log('\n🧪 ========================================');
  console.log('🧪 TICKET SENDING TEST SUITE');
  console.log('🧪 ========================================\n');
  
  // Load TypeScript modules
  console.log('📦 Loading modules...');
  await loadModules();
  console.log('✅ Modules loaded\n');
  
  // Get booking ID
  let bookingId = TEST_CONFIG.bookingId;
  
  if (!bookingId) {
    console.log('📋 No booking ID provided, fetching latest booking...');
    const latestBooking = await getLatestBooking();
    
    if (!latestBooking) {
      console.error('❌ No bookings found in database. Please create a booking first.');
      process.exit(1);
    }
    
    bookingId = latestBooking.id;
    console.log(`✅ Using latest booking: ${bookingId}`);
    console.log(`   Customer: ${latestBooking.customer_name}`);
    console.log(`   Email: ${latestBooking.customer_email || 'not provided'}`);
    console.log(`   Phone: ${latestBooking.customer_phone || 'not provided'}`);
    console.log(`   Visitors: ${latestBooking.visitor_count} (${latestBooking.adult_count || 0} adults, ${latestBooking.child_count || 0} children)`);
  }
  
  // Test 1: PDF Generation
  const pdfResult = await testPDFGeneration(bookingId);
  
  if (!pdfResult) {
    console.error('\n❌ PDF generation failed. Cannot continue with email/WhatsApp tests.');
    process.exit(1);
  }
  
  // Generate PDF buffer for email/WhatsApp tests
  const pdfBase64 = await generateBookingTicketPDFBase64(bookingId, 'en');
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  
  // Test 2: Email Sending
  const emailResult = await testEmailSending(pdfBuffer, bookingId);
  
  // Test 3: WhatsApp Sending
  const whatsappResult = await testWhatsAppSending(pdfBuffer, bookingId);
  
  // Summary
  console.log('\n📊 ========================================');
  console.log('📊 TEST SUMMARY');
  console.log('📊 ========================================\n');
  
  console.log(`PDF Generation:     ${pdfResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Email Sending:      ${emailResult.skipped ? '⚠️ SKIPPED' : emailResult.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`WhatsApp Sending:   ${whatsappResult.skipped ? '⚠️ SKIPPED' : whatsappResult.success ? '✅ PASS' : '❌ FAIL'}`);
  
  console.log('\n📋 ========================================');
  console.log('📋 RECOMMENDATIONS');
  console.log('📋 ========================================\n');
  
  if (!emailResult.success && !emailResult.skipped) {
    console.log('❌ Email sending failed. Check:');
    console.log('   1. SMTP_USER and SMTP_PASS are set in .env');
    console.log('   2. SMTP credentials are correct');
    console.log('   3. Gmail App Password is used (not regular password)');
    console.log('   4. Firewall allows SMTP connections\n');
  }
  
  if (!whatsappResult.success && !whatsappResult.skipped) {
    console.log('❌ WhatsApp sending failed. Check:');
    console.log('   1. WHATSAPP_PROVIDER is set in .env');
    console.log('   2. WHATSAPP_ACCESS_TOKEN is valid');
    console.log('   3. WHATSAPP_PHONE_NUMBER_ID is correct');
    console.log('   4. Phone number is registered in WhatsApp Business\n');
  }
  
  if (emailResult.skipped && whatsappResult.skipped) {
    console.log('⚠️ Both email and WhatsApp are not configured.');
    console.log('   At least one must be configured to send tickets.\n');
  }
  
  await pool.end();
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

