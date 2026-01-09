/**
 * Diagnostic Script for Email Delivery Issues
 * 
 * Checks all possible reasons why emails might not be sent
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function diagnoseEmailDelivery() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 ========================================');
    console.log('🔍 EMAIL DELIVERY DIAGNOSTIC TOOL');
    console.log('🔍 ========================================\n');

    // Find a booking with email that should have invoice
    const booking = await client.query(
      `SELECT 
        b.id,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.zoho_invoice_id,
        b.tenant_id,
        b.created_at
      FROM bookings b
      WHERE b.customer_email IS NOT NULL 
        AND b.customer_email != ''
        AND b.customer_email LIKE '%@%'
      ORDER BY b.created_at DESC
      LIMIT 1`
    );

    if (booking.rows.length === 0) {
      console.log('❌ No bookings with valid email found');
      return;
    }

    const testBooking = booking.rows[0];
    console.log(`📋 Testing with Booking ID: ${testBooking.id}`);
    console.log(`   Customer: ${testBooking.customer_name}`);
    console.log(`   Email: ${testBooking.customer_email}`);
    console.log(`   Invoice ID: ${testBooking.zoho_invoice_id || 'NOT CREATED'}\n`);

    // Check 1: Email format
    console.log('✅ Check 1: Email Format Validation');
    console.log('─'.repeat(50));
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidFormat = emailRegex.test(testBooking.customer_email.trim());
    console.log(`   Email: ${testBooking.customer_email}`);
    console.log(`   Trimmed: ${testBooking.customer_email.trim()}`);
    console.log(`   Valid Format: ${isValidFormat ? '✅ YES' : '❌ NO'}\n`);

    // Check 2: Invoice exists
    console.log('✅ Check 2: Invoice Creation Status');
    console.log('─'.repeat(50));
    if (testBooking.zoho_invoice_id) {
      console.log(`   Invoice ID: ${testBooking.zoho_invoice_id} ✅`);
      
      // Check invoice logs
      const invoiceLogs = await client.query(
        `SELECT status, error_message, created_at
         FROM zoho_invoice_logs
         WHERE booking_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [testBooking.id]
      );
      
      if (invoiceLogs.rows.length > 0) {
        console.log(`   Last Log Status: ${invoiceLogs.rows[0].status}`);
        if (invoiceLogs.rows[0].error_message) {
          console.log(`   Error: ${invoiceLogs.rows[0].error_message}`);
        }
      }
    } else {
      console.log(`   Invoice ID: ❌ NOT CREATED`);
      console.log(`   → Invoice must be created first before email can be sent\n`);
    }

    // Check 3: Zoho tokens
    console.log('✅ Check 3: Zoho Token Status');
    console.log('─'.repeat(50));
    const tokens = await client.query(
      `SELECT 
        expires_at,
        CASE 
          WHEN expires_at > NOW() + INTERVAL '5 minutes' THEN 'active'
          ELSE 'expired'
        END as status
      FROM zoho_tokens
      WHERE tenant_id = $1`,
      [testBooking.tenant_id]
    );
    
    if (tokens.rows.length > 0) {
      const token = tokens.rows[0];
      console.log(`   Token Status: ${token.status === 'active' ? '✅ ACTIVE' : '❌ EXPIRED'}`);
      console.log(`   Expires: ${token.expires_at}`);
    } else {
      console.log(`   Token Status: ❌ NOT FOUND`);
      console.log(`   → Zoho must be connected first\n`);
    }

    // Check 4: Zoho configuration
    console.log('✅ Check 4: Zoho Configuration');
    console.log('─'.repeat(50));
    const config = await client.query(
      `SELECT client_id, client_secret, region, is_active
       FROM tenant_zoho_configs
       WHERE tenant_id = $1 AND is_active = true`,
      [testBooking.tenant_id]
    );
    
    if (config.rows.length > 0) {
      const cfg = config.rows[0];
      console.log(`   Client ID: ${cfg.client_id ? '✅ Set' : '❌ Missing'}`);
      console.log(`   Client Secret: ${cfg.client_secret ? '✅ Set' : '❌ Missing'}`);
      console.log(`   Region: ${cfg.region || 'N/A'}`);
      console.log(`   Active: ${cfg.is_active ? '✅' : '❌'}\n`);
    } else {
      console.log(`   Configuration: ❌ NOT FOUND\n`);
    }

    // Check 5: Test email extraction
    console.log('✅ Check 5: Email Extraction Test');
    console.log('─'.repeat(50));
    
    // Simulate mapBookingToInvoice query
    const bookingData = await client.query(
      `SELECT 
        b.customer_email,
        b.customer_phone,
        b.customer_name
      FROM bookings b
      WHERE b.id = $1`,
      [testBooking.id]
    );
    
    if (bookingData.rows.length > 0) {
      const data = bookingData.rows[0];
      console.log(`   Raw customer_email: ${data.customer_email || 'NULL'}`);
      console.log(`   Type: ${typeof data.customer_email}`);
      console.log(`   Is null: ${data.customer_email === null}`);
      console.log(`   Is undefined: ${data.customer_email === undefined}`);
      console.log(`   Length: ${data.customer_email?.length || 0}`);
      console.log(`   Trimmed: ${data.customer_email?.trim() || 'EMPTY'}`);
      console.log(`   Truthy check: ${data.customer_email ? 'YES' : 'NO'}\n`);
    }

    // Check 6: Test actual email sending (if invoice exists)
    if (testBooking.zoho_invoice_id) {
      console.log('✅ Check 6: Test Email Sending');
      console.log('─'.repeat(50));
      
      try {
        const zohoServiceModule = await import('../src/services/zohoService.ts');
        const { zohoService } = zohoServiceModule;
        
        console.log(`   Attempting to send email to ${testBooking.customer_email}...`);
        console.log(`   Invoice ID: ${testBooking.zoho_invoice_id}`);
        
        await zohoService.sendInvoiceEmail(
          testBooking.tenant_id,
          testBooking.zoho_invoice_id,
          testBooking.customer_email
        );
        
        console.log(`   ✅ Email sent successfully!\n`);
      } catch (error) {
        console.log(`   ❌ Email sending failed:`);
        console.log(`      ${error.message}`);
        if (error.response) {
          console.log(`      Status: ${error.response.status}`);
          console.log(`      Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        console.log();
      }
    } else {
      console.log('✅ Check 6: Test Email Sending');
      console.log('─'.repeat(50));
      console.log(`   ⚠️  Skipped - Invoice not created yet\n`);
    }

    // Summary
    console.log('📊 ========================================');
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('📊 ========================================\n');
    
    const issues = [];
    
    if (!isValidFormat) {
      issues.push('❌ Email format is invalid');
    }
    
    if (!testBooking.zoho_invoice_id) {
      issues.push('❌ Invoice not created');
    }
    
    if (tokens.rows.length === 0) {
      issues.push('❌ Zoho tokens not found');
    } else if (tokens.rows[0].status === 'expired') {
      issues.push('⚠️  Zoho token expired (should auto-refresh)');
    }
    
    if (config.rows.length === 0) {
      issues.push('❌ Zoho configuration not found');
    }
    
    if (issues.length === 0) {
      console.log('✅ All checks passed! Email should be working.\n');
      console.log('💡 If emails still not received, check:');
      console.log('   1. Customer spam folder');
      console.log('   2. Zoho Invoice email logs');
      console.log('   3. Zoho account email sending limits');
      console.log('   4. Server logs for detailed error messages\n');
    } else {
      console.log('❌ Issues found:\n');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log();
    }

  } catch (error) {
    console.error('\n❌ Diagnostic Error:', error);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnoseEmailDelivery();

