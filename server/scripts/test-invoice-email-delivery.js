/**
 * Comprehensive Test Script for Invoice Email Delivery
 * 
 * This script tests all aspects of invoice email delivery to identify issues
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function testInvoiceEmailDelivery() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 ========================================');
    console.log('🧪 INVOICE EMAIL DELIVERY TEST SUITE');
    console.log('🧪 ========================================\n');

    // Test Scenario 1: Check recent bookings with emails
    console.log('📋 Test Scenario 1: Check Recent Bookings with Emails');
    console.log('─'.repeat(50));
    
    const bookingsWithEmail = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        zoho_invoice_id,
        zoho_invoice_created_at,
        created_at,
        tenant_id
      FROM bookings
      WHERE customer_email IS NOT NULL 
        AND customer_email != ''
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 10`
    );

    console.log(`Found ${bookingsWithEmail.rows.length} recent bookings with email\n`);
    
    if (bookingsWithEmail.rows.length === 0) {
      console.log('⚠️  No bookings with email found in last 7 days');
      console.log('   Creating a test booking...\n');
      
      // Create a test booking
      const testTenant = await client.query('SELECT id FROM tenants LIMIT 1');
      if (testTenant.rows.length === 0) {
        console.error('❌ No tenants found. Cannot create test booking.');
        return;
      }
      
      const testService = await client.query('SELECT id FROM services LIMIT 1');
      if (testService.rows.length === 0) {
        console.error('❌ No services found. Cannot create test booking.');
        return;
      }
      
      const testSlot = await client.query('SELECT id FROM slots WHERE available_capacity > 0 LIMIT 1');
      if (testSlot.rows.length === 0) {
        console.error('❌ No available slots found. Cannot create test booking.');
        return;
      }
      
      const testBooking = await client.query(
        `INSERT INTO bookings (
          tenant_id, service_id, slot_id,
          customer_name, customer_email, customer_phone,
          visitor_count, adult_count, child_count,
          total_price, status, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          testTenant.rows[0].id,
          testService.rows[0].id,
          testSlot.rows[0].id,
          'Test Customer',
          'test@example.com',
          '+201234567890',
          1, 1, 0,
          100,
          'confirmed',
          'unpaid'
        ]
      );
      
      console.log(`✅ Created test booking: ${testBooking.rows[0].id}`);
      console.log(`   Email: ${testBooking.rows[0].customer_email}\n`);
      
      bookingsWithEmail.rows.push(testBooking.rows[0]);
    }

    // Test Scenario 2: Check invoice creation status
    console.log('📋 Test Scenario 2: Check Invoice Creation Status');
    console.log('─'.repeat(50));
    
    for (const booking of bookingsWithEmail.rows) {
      console.log(`\nBooking ID: ${booking.id}`);
      console.log(`  Customer: ${booking.customer_name}`);
      console.log(`  Email: ${booking.customer_email}`);
      console.log(`  Phone: ${booking.customer_phone || 'N/A'}`);
      console.log(`  Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
      console.log(`  Invoice Created: ${booking.zoho_invoice_created_at || 'N/A'}`);
      
      // Check invoice logs
      if (booking.zoho_invoice_id) {
        const invoiceLogs = await client.query(
          `SELECT status, error_message, created_at, request_payload, response_payload
           FROM zoho_invoice_logs
           WHERE booking_id = $1
           ORDER BY created_at DESC
           LIMIT 5`,
          [booking.id]
        );
        
        console.log(`  Invoice Logs: ${invoiceLogs.rows.length} entries`);
        for (const log of invoiceLogs.rows) {
          console.log(`    - Status: ${log.status}`);
          console.log(`      Created: ${log.created_at}`);
          if (log.error_message) {
            console.log(`      Error: ${log.error_message}`);
          }
          
          // Check if email was sent
          if (log.request_payload) {
            try {
              const payload = JSON.parse(log.request_payload);
              if (payload.email || payload.delivery_method === 'email') {
                console.log(`      📧 Email delivery attempted`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Test Scenario 3: Test email extraction from booking
    console.log('\n\n📋 Test Scenario 3: Test Email Extraction');
    console.log('─'.repeat(50));
    
    if (bookingsWithEmail.rows.length > 0) {
      const testBooking = bookingsWithEmail.rows[0];
      
      // Simulate what mapBookingToInvoice does
      const bookingData = await client.query(
        `SELECT 
          b.*,
          s.name as service_name,
          ts.start_time,
          ts.end_time,
          ts.slot_date
        FROM bookings b
        JOIN services s ON b.service_id = s.id
        JOIN slots ts ON b.slot_id = ts.id
        WHERE b.id = $1`,
        [testBooking.id]
      );
      
      if (bookingData.rows.length > 0) {
        const booking = bookingData.rows[0];
        console.log(`\nBooking Data Extraction:`);
        console.log(`  customer_email (raw): ${booking.customer_email || 'NULL'}`);
        console.log(`  customer_email (type): ${typeof booking.customer_email}`);
        console.log(`  customer_email (length): ${booking.customer_email?.length || 0}`);
        console.log(`  customer_email (trimmed): ${booking.customer_email?.trim() || 'EMPTY'}`);
        
        // Test email validation
        if (booking.customer_email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const isValid = emailRegex.test(booking.customer_email.trim());
          console.log(`  Email valid: ${isValid ? '✅' : '❌'}`);
        }
      }
    }

    // Test Scenario 4: Check Zoho token status
    console.log('\n\n📋 Test Scenario 4: Check Zoho Token Status');
    console.log('─'.repeat(50));
    
    if (bookingsWithEmail.rows.length > 0) {
      const tenantId = bookingsWithEmail.rows[0].tenant_id;
      
      const zohoTokens = await client.query(
        `SELECT 
          tenant_id,
          expires_at,
          created_at,
          updated_at,
          CASE 
            WHEN expires_at > NOW() THEN 'active'
            ELSE 'expired'
          END as status
        FROM zoho_tokens
        WHERE tenant_id = $1`,
        [tenantId]
      );
      
      if (zohoTokens.rows.length > 0) {
        const token = zohoTokens.rows[0];
        console.log(`\nZoho Token Status:`);
        console.log(`  Tenant ID: ${token.tenant_id}`);
        console.log(`  Status: ${token.status}`);
        console.log(`  Expires: ${token.expires_at}`);
        console.log(`  Created: ${token.created_at}`);
        console.log(`  Updated: ${token.updated_at}`);
      } else {
        console.log(`\n❌ No Zoho tokens found for tenant ${tenantId}`);
        console.log(`   This means Zoho is not connected!`);
      }
    }

    // Test Scenario 5: Test actual invoice generation
    console.log('\n\n📋 Test Scenario 5: Test Invoice Generation');
    console.log('─'.repeat(50));
    
    if (bookingsWithEmail.rows.length > 0) {
      const testBooking = bookingsWithEmail.rows[0];
      
      console.log(`\nAttempting to generate invoice for booking ${testBooking.id}...`);
      console.log(`  Email: ${testBooking.customer_email}`);
      
      try {
        // Import zohoService
        const zohoServiceModule = await import('../src/services/zohoService.ts');
        const { zohoService } = zohoServiceModule;
        
        console.log('  Calling generateReceipt...');
        const result = await zohoService.generateReceipt(testBooking.id);
        
        console.log(`\n  Result:`);
        console.log(`    Success: ${result.success ? '✅' : '❌'}`);
        console.log(`    Invoice ID: ${result.invoiceId || 'N/A'}`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
        
        // Check if email was sent
        const emailLogs = await client.query(
          `SELECT status, error_message, request_payload
           FROM zoho_invoice_logs
           WHERE booking_id = $1
             AND (status = 'email_sent' OR status = 'email_failed')
           ORDER BY created_at DESC
           LIMIT 1`,
          [testBooking.id]
        );
        
        if (emailLogs.rows.length > 0) {
          const log = emailLogs.rows[0];
          console.log(`\n  Email Delivery Status:`);
          console.log(`    Status: ${log.status}`);
          if (log.error_message) {
            console.log(`    Error: ${log.error_message}`);
          }
        } else {
          console.log(`\n  ⚠️  No email delivery log found`);
        }
        
      } catch (error) {
        console.error(`\n  ❌ Error generating invoice:`);
        console.error(`    ${error.message}`);
        console.error(`    ${error.stack}`);
      }
    }

    // Test Scenario 6: Check Zoho configuration
    console.log('\n\n📋 Test Scenario 6: Check Zoho Configuration');
    console.log('─'.repeat(50));
    
    if (bookingsWithEmail.rows.length > 0) {
      const tenantId = bookingsWithEmail.rows[0].tenant_id;
      
      const zohoConfig = await client.query(
        `SELECT 
          client_id,
          redirect_uri,
          region,
          is_active
        FROM tenant_zoho_configs
        WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
      );
      
      if (zohoConfig.rows.length > 0) {
        const config = zohoConfig.rows[0];
        console.log(`\nZoho Configuration:`);
        console.log(`  Client ID: ${config.client_id ? '✅ Set' : '❌ Missing'}`);
        console.log(`  Redirect URI: ${config.redirect_uri || 'N/A'}`);
        console.log(`  Region: ${config.region || 'N/A'}`);
        console.log(`  Active: ${config.is_active ? '✅' : '❌'}`);
      } else {
        console.log(`\n❌ No Zoho configuration found for tenant ${tenantId}`);
      }
    }

    console.log('\n\n✅ ========================================');
    console.log('✅ TEST SUITE COMPLETE');
    console.log('✅ ========================================\n');

  } catch (error) {
    console.error('\n❌ Test Error:', error);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testInvoiceEmailDelivery();

