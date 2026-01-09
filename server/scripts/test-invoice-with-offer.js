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

async function testInvoiceWithOffer() {
  const client = await pool.connect();
  try {
    if (!bookingId) {
      console.log('Usage: node scripts/test-invoice-with-offer.js <booking_id>');
      console.log('\nFinding a booking with an offer...\n');
      
      // Find a booking with an offer
      const result = await client.query(
        `SELECT id, customer_name, total_price, offer_id, service_id
         FROM bookings
         WHERE offer_id IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5`
      );
      
      if (result.rows.length === 0) {
        console.log('❌ No bookings with offers found');
        return;
      }
      
      console.log('Found bookings with offers:');
      result.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. Booking ID: ${row.id}`);
        console.log(`     Customer: ${row.customer_name}`);
        console.log(`     Total Price: ${row.total_price}`);
        console.log(`     Offer ID: ${row.offer_id}`);
        console.log('');
      });
      
      console.log('Run: node scripts/test-invoice-with-offer.js <booking_id>');
      return;
    }

    console.log('🧪 Testing Invoice Mapping with Offer\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);

    // Get booking details
    const bookingResult = await client.query(
      `SELECT 
        b.*,
        s.name as service_name,
        s.base_price,
        s.child_price,
        o.price as offer_price,
        o.name as offer_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      LEFT JOIN service_offers o ON b.offer_id = o.id
      WHERE b.id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }

    const booking = bookingResult.rows[0];

    console.log('📋 Booking Details:');
    console.log(`   Service: ${booking.service_name}`);
    console.log(`   Base Price: ${booking.base_price}`);
    console.log(`   Child Price: ${booking.child_price || 'N/A'}`);
    console.log(`   Offer ID: ${booking.offer_id || 'None'}`);
    if (booking.offer_id) {
      console.log(`   Offer Name: ${booking.offer_name || 'N/A'}`);
      console.log(`   Offer Price: ${booking.offer_price || 'N/A'}`);
    }
    console.log(`   Adult Count: ${booking.adult_count || 0}`);
    console.log(`   Child Count: ${booking.child_count || 0}`);
    console.log(`   Total Price: ${booking.total_price}`);
    console.log('');

    // Test invoice mapping
    console.log('🧪 Testing Invoice Mapping...\n');
    const { zohoService } = await import('../src/services/zohoService.ts');
    const invoiceData = await zohoService.mapBookingToInvoice(bookingId);

    console.log('📋 Invoice Line Items:');
    invoiceData.line_items.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.name}`);
      console.log(`      Rate: ${item.rate} SAR`);
      console.log(`      Quantity: ${item.quantity}`);
      console.log(`      Subtotal: ${item.rate * item.quantity} SAR`);
      console.log('');
    });

    const totalFromItems = invoiceData.line_items.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
    console.log(`   Total from line items: ${totalFromItems} SAR`);
    console.log(`   Booking total_price: ${booking.total_price} SAR`);
    console.log('');

    if (Math.abs(totalFromItems - parseFloat(booking.total_price)) < 0.01) {
      console.log('✅ Invoice totals match booking total!');
    } else {
      console.log('⚠️  Invoice totals do NOT match booking total!');
      console.log(`   Difference: ${Math.abs(totalFromItems - parseFloat(booking.total_price))} SAR`);
    }

    if (booking.offer_id) {
      const hasOfferPrice = invoiceData.line_items.some(item => 
        item.name.includes(booking.offer_name) || 
        (item.rate === parseFloat(booking.offer_price))
      );
      if (hasOfferPrice) {
        console.log('✅ Offer price is correctly used in invoice!');
      } else {
        console.log('❌ Offer price is NOT used in invoice!');
        console.log('   Invoice is using base price instead of offer price');
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

testInvoiceWithOffer();

