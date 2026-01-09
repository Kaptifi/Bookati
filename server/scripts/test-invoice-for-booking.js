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

async function testInvoiceForBooking() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Invoice Creation and Delivery\n');
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
    console.log(`   Customer: ${booking.customer_name}`);
    console.log(`   Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
    console.log('');

    // Check if invoice should be sent
    console.log('🔍 Analysis:');
    if (!booking.customer_phone) {
      console.log('   ❌ No phone number - invoice will NOT be created (phone required)');
      return;
    }

    if (booking.zoho_invoice_id) {
      console.log('   ✅ Invoice exists');
      console.log('   📧 Email delivery: Should be sent via Zoho API');
      console.log('   📱 WhatsApp delivery: Should be sent if delivery code executed');
      console.log('');
      console.log('   ⚠️  If invoice exists but wasn\'t sent, the delivery code may not have executed');
      console.log('   💡 Try calling generateReceipt again - it should now attempt delivery');
    } else {
      console.log('   ⚠️  Invoice not created yet');
      console.log('   💡 Invoice should be created automatically when booking is made');
    }

    console.log('');
    console.log('📋 To manually trigger invoice creation/delivery:');
    console.log('   1. Make sure server is running');
    console.log('   2. Use the API: POST /api/zoho/test-invoice');
    console.log('   3. Or check server logs when creating a new booking');
    console.log('');
    console.log('🔍 Check server logs for:');
    console.log('   [ZohoService] 📋 Customer contact info for invoice:');
    console.log('   [ZohoService] 📧 Attempting to send invoice via email...');
    console.log('   [ZohoService] 📱 Step 2-3: Downloading invoice PDF...');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testInvoiceForBooking();

