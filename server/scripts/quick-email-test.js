/**
 * Quick Email Test - Test email delivery for a specific booking
 * 
 * Usage: node scripts/quick-email-test.js <booking-id>
 * Example: node scripts/quick-email-test.js abc123-def456-...
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

const bookingId = process.argv[2];

if (!bookingId) {
  console.error('❌ Please provide a booking ID');
  console.error('Usage: node scripts/quick-email-test.js <booking-id>');
  process.exit(1);
}

async function quickEmailTest() {
  const client = await pool.connect();
  
  try {
    console.log(`🧪 Testing email delivery for booking: ${bookingId}\n`);

    // Get booking details
    const booking = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        zoho_invoice_id,
        tenant_id
      FROM bookings
      WHERE id = $1`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      console.error(`❌ Booking ${bookingId} not found`);
      return;
    }

    const b = booking.rows[0];
    console.log(`📋 Booking Details:`);
    console.log(`   Customer: ${b.customer_name}`);
    console.log(`   Email: ${b.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Phone: ${b.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Invoice ID: ${b.zoho_invoice_id || 'NOT CREATED'}\n`);

    if (!b.customer_email) {
      console.error('❌ No email address found for this booking');
      return;
    }

    if (!b.zoho_invoice_id) {
      console.log('📧 Invoice not created yet. Creating invoice first...\n');
      
      try {
        // Use dynamic import with proper path resolution
        const zohoServiceModule = await import('../src/services/zohoService.ts');
        const { zohoService } = zohoServiceModule;
        const result = await zohoService.generateReceipt(b.id);
        
        if (result.success) {
          console.log(`✅ Invoice created: ${result.invoiceId}`);
          
          // Refresh booking data
          const updated = await client.query(
            `SELECT zoho_invoice_id FROM bookings WHERE id = $1`,
            [b.id]
          );
          b.zoho_invoice_id = updated.rows[0].zoho_invoice_id;
        } else {
          console.error(`❌ Failed to create invoice: ${result.error}`);
          return;
        }
      } catch (error) {
        console.error(`❌ Error creating invoice: ${error.message}`);
        return;
      }
    }

    // Test email sending
    console.log(`\n📧 Testing email delivery...`);
    console.log(`   Invoice ID: ${b.zoho_invoice_id}`);
    console.log(`   Email: ${b.customer_email}\n`);

    try {
      const zohoServiceModule = await import('../src/services/zohoService.ts');
      const { zohoService } = zohoServiceModule;
      await zohoService.sendInvoiceEmail(b.tenant_id, b.zoho_invoice_id, b.customer_email);
      
      console.log(`✅ Email sent successfully!`);
      console.log(`   Check ${b.customer_email} inbox (and spam folder)`);
    } catch (error) {
      console.error(`❌ Email sending failed:`);
      console.error(`   ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }

  } catch (error) {
    console.error('❌ Test Error:', error);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

quickEmailTest();

