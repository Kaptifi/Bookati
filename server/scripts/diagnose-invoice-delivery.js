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

const bookingId = process.argv[2] || '3bd1b8f1-cd6e-4a60-b336-71a8d3cb9bcc';

async function diagnoseInvoiceDelivery() {
  const client = await pool.connect();
  try {
    console.log('🔍 Diagnosing Invoice Delivery Issue\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);

    // Get booking details directly from database
    const bookingResult = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        tenant_id,
        zoho_invoice_id,
        zoho_invoice_created_at,
        created_at
      FROM bookings
      WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }

    const booking = bookingResult.rows[0];

    console.log('📋 Direct Database Query Results:');
    console.log(`   Customer Name: ${booking.customer_name}`);
    console.log(`   Customer Email: ${booking.customer_email || 'NULL'}`);
    console.log(`   Customer Phone: ${booking.customer_phone || 'NULL'}`);
    console.log(`   Tenant ID: ${booking.tenant_id}`);
    console.log(`   Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
    console.log(`   Invoice Created At: ${booking.zoho_invoice_created_at || 'NOT CREATED'}`);
    console.log('');

    // Check what mapBookingToInvoice would return
    console.log('🔍 Testing mapBookingToInvoice Query:');
    const mapQueryResult = await client.query(
      `SELECT 
        b.*,
        s.name as service_name,
        s.name_ar as service_name_ar,
        s.description as service_description,
        s.description_ar as service_description_ar,
        s.base_price,
        s.child_price,
        ts.start_time,
        ts.end_time,
        ts.slot_date,
        t.name as tenant_name,
        t.name_ar as tenant_name_ar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN slots ts ON b.slot_id = ts.id
      JOIN tenants t ON b.tenant_id = t.id
      WHERE b.id = $1`,
      [bookingId]
    );

    if (mapQueryResult.rows.length > 0) {
      const mappedBooking = mapQueryResult.rows[0];
      console.log(`   customer_email from mapBookingToInvoice: ${mappedBooking.customer_email || 'NULL/UNDEFINED'}`);
      console.log(`   customer_phone from mapBookingToInvoice: ${mappedBooking.customer_phone || 'NULL/UNDEFINED'}`);
      console.log('');
    }

    // Check Zoho tokens
    console.log('🔍 Checking Zoho Token Status:');
    const tokenResult = await client.query(
      `SELECT 
        tenant_id,
        access_token IS NOT NULL as has_access_token,
        refresh_token IS NOT NULL as has_refresh_token,
        expires_at,
        CASE 
          WHEN expires_at > now() THEN 'VALID'
          ELSE 'EXPIRED'
        END as token_status
      FROM zoho_tokens
      WHERE tenant_id = $1`,
      [booking.tenant_id]
    );

    if (tokenResult.rows.length > 0) {
      const token = tokenResult.rows[0];
      console.log(`   Has Access Token: ${token.has_access_token}`);
      console.log(`   Has Refresh Token: ${token.has_refresh_token}`);
      console.log(`   Token Status: ${token.token_status}`);
      console.log(`   Expires At: ${token.expires_at || 'N/A'}`);
    } else {
      console.log('   ❌ No Zoho tokens found for this tenant');
      console.log('   💡 Need to complete OAuth flow first');
    }
    console.log('');

    // Check invoice logs
    console.log('🔍 Checking Invoice Logs:');
    const logResult = await client.query(
      `SELECT 
        id,
        status,
        zoho_invoice_id,
        error_message,
        created_at
      FROM zoho_invoice_logs
      WHERE booking_id = $1
      ORDER BY created_at DESC
      LIMIT 5`,
      [bookingId]
    );

    if (logResult.rows.length > 0) {
      console.log(`   Found ${logResult.rows.length} log entries:`);
      logResult.rows.forEach((log, idx) => {
        console.log(`   ${idx + 1}. Status: ${log.status}, Invoice ID: ${log.zoho_invoice_id || 'N/A'}, Created: ${log.created_at}`);
        if (log.error_message) {
          console.log(`      Error: ${log.error_message}`);
        }
      });
    } else {
      console.log('   ⚠️ No invoice logs found');
    }
    console.log('');

    // Summary
    console.log('📊 Summary:');
    const hasEmail = !!booking.customer_email;
    const hasPhone = !!booking.customer_phone;
    const hasInvoice = !!booking.zoho_invoice_id;
    const hasTokens = tokenResult.rows.length > 0;

    console.log(`   ✅ Email provided: ${hasEmail ? 'YES' : 'NO'}`);
    console.log(`   ✅ Phone provided: ${hasPhone ? 'YES' : 'NO'}`);
    console.log(`   ✅ Invoice created: ${hasInvoice ? 'YES' : 'NO'}`);
    console.log(`   ✅ Zoho tokens: ${hasTokens ? 'YES' : 'NO'}`);
    console.log('');

    if (!hasPhone) {
      console.log('❌ ISSUE: No phone number - invoice will NOT be sent via WhatsApp');
    }
    if (!hasEmail) {
      console.log('⚠️  WARNING: No email - invoice will NOT be sent via email');
    }
    if (!hasInvoice) {
      console.log('⚠️  WARNING: Invoice not created yet');
    }
    if (!hasTokens) {
      console.log('❌ ISSUE: No Zoho tokens - need to complete OAuth flow');
    }

    if (hasPhone && hasInvoice && hasTokens) {
      console.log('');
      console.log('💡 All prerequisites met. Invoice delivery should work.');
      console.log('   If invoices are still not being sent, check server logs for:');
      console.log('   - [ZohoService] 📧 Attempting to send invoice via email...');
      console.log('   - [ZohoService] 📱 Step 2-3: Downloading invoice PDF...');
      console.log('   - Any error messages from sendInvoiceEmail or sendInvoiceViaWhatsApp');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnoseInvoiceDelivery();

