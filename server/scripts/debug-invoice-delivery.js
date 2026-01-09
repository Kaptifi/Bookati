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

const bookingId = process.argv[2];

if (!bookingId) {
  console.log('Usage: node debug-invoice-delivery.js <booking_id>');
  console.log('Example: node debug-invoice-delivery.js 123e4567-e89b-12d3-a456-426614174000');
  process.exit(1);
}

async function debugInvoiceDelivery() {
  const client = await pool.connect();
  try {
    console.log('🔍 Debugging Invoice Delivery\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);

    // Get booking details
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

    console.log('📋 Booking Details:');
    console.log(`   Customer Name: ${booking.customer_name}`);
    console.log(`   Customer Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Customer Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Tenant ID: ${booking.tenant_id}`);
    console.log(`   Zoho Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
    console.log(`   Invoice Created At: ${booking.zoho_invoice_created_at || 'NOT CREATED'}`);
    console.log('');

    // Check Zoho token status
    const tokenResult = await client.query(
      `SELECT 
        tenant_id,
        expires_at,
        CASE 
          WHEN expires_at > now() THEN 'active'
          ELSE 'expired'
        END as status
      FROM zoho_tokens
      WHERE tenant_id = $1`,
      [booking.tenant_id]
    );

    console.log('🔐 Zoho Token Status:');
    if (tokenResult.rows.length === 0) {
      console.log('   ❌ No Zoho token found');
      console.log(`   📋 To authenticate: http://localhost:3001/api/zoho/auth?tenant_id=${booking.tenant_id}`);
    } else {
      const token = tokenResult.rows[0];
      console.log(`   Status: ${token.status}`);
      console.log(`   Expires At: ${token.expires_at}`);
    }
    console.log('');

    // Check invoice logs
    const logResult = await client.query(
      `SELECT 
        id,
        status,
        error_message,
        created_at
      FROM zoho_invoice_logs
      WHERE booking_id = $1
      ORDER BY created_at DESC
      LIMIT 5`,
      [bookingId]
    );

    console.log(`📝 Invoice Logs (${logResult.rows.length}):`);
    if (logResult.rows.length > 0) {
      logResult.rows.forEach((log, index) => {
        console.log(`   ${index + 1}. Status: ${log.status}`);
        if (log.error_message) {
          console.log(`      Error: ${log.error_message}`);
        }
        console.log(`      Created: ${log.created_at}`);
      });
    } else {
      console.log('   No logs found');
    }
    console.log('');

    // Diagnosis
    console.log('🔍 Diagnosis:');
    
    if (!booking.zoho_invoice_id) {
      console.log('   ❌ Invoice was NOT created');
      if (tokenResult.rows.length === 0) {
        console.log('   ⚠️  Reason: Zoho not authenticated');
      } else if (!booking.customer_phone) {
        console.log('   ⚠️  Reason: No customer phone provided');
      } else {
        console.log('   ⚠️  Reason: Invoice creation failed (check logs above)');
      }
    } else {
      console.log('   ✅ Invoice was created');
      
      if (!booking.customer_email && !booking.customer_phone) {
        console.log('   ⚠️  Invoice created but NOT sent (no email or phone)');
      } else {
        if (booking.customer_email) {
          console.log('   📧 Email delivery: Should have been sent');
        }
        if (booking.customer_phone) {
          console.log('   📱 WhatsApp delivery: Should have been sent');
        }
        console.log('   ⚠️  If not received, check server logs for delivery errors');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

debugInvoiceDelivery();

