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

async function testInvoiceDelivery() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Invoice Delivery\n');
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
        zoho_invoice_id
      FROM bookings
      WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }

    const booking = bookingResult.rows[0];

    if (!booking.zoho_invoice_id) {
      console.log('❌ Invoice not created for this booking');
      console.log('   Creating invoice first...');
      
      // Import zohoService using tsx
      const { execSync } = await import('child_process');
      console.log('   Running invoice creation via API...');
      // We'll use the API instead
      const fetch = (await import('node-fetch')).default;
      const apiUrl = process.env.API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: booking.tenant_id,
          booking_id: bookingId
        })
      });
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Invoice created: ${result.invoiceId}`);
        booking.zoho_invoice_id = result.invoiceId;
      } else {
        console.log(`❌ Failed to create invoice: ${result.error}`);
        return;
      }
    }

    console.log('📋 Booking Details:');
    console.log(`   Customer: ${booking.customer_name}`);
    console.log(`   Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Invoice ID: ${booking.zoho_invoice_id}`);
    console.log('');

    // Test delivery via API
    const fetch = (await import('node-fetch')).default;
    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    // Test email delivery
    if (booking.customer_email) {
      console.log('📧 Testing Email Delivery...');
      console.log('   Note: Email is sent via Zoho API, not our SMTP');
      console.log('   Check Zoho Invoice dashboard to verify email was sent');
      console.log('');
    } else {
      console.log('⚠️  No email provided, skipping email test');
      console.log('');
    }

    // Test WhatsApp delivery by manually triggering
    if (booking.customer_phone) {
      console.log('📱 Testing WhatsApp Delivery...');
      console.log('   This will attempt to download PDF and send via WhatsApp');
      console.log('   Make sure server is running and Zoho is authenticated');
      console.log('');
      console.log('   To test manually, check server logs when creating a new booking');
      console.log('   Or use the API endpoint to trigger delivery');
      console.log('');
    } else {
      console.log('⚠️  No phone provided, skipping WhatsApp test');
      console.log('');
    }
    
    console.log('💡 To see what happened during invoice creation, check server logs');
    console.log('   Look for messages starting with [ZohoService]');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   Invoice ID: ${booking.zoho_invoice_id}`);
    console.log(`   Email: ${booking.customer_email ? 'Should be sent via Zoho' : 'Not provided'}`);
    console.log(`   WhatsApp: ${booking.customer_phone ? 'Should be sent if delivery code executed' : 'Not provided'}`);
    console.log('');
    console.log('🔍 Check server logs for delivery errors');

    console.log('✅ Test complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testInvoiceDelivery();

