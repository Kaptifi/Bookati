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

const bookingId = '29d01803-8b04-4e4d-a5af-9eba4ff49dd0';
const customerEmail = 'kaptifidev@gmail.com';

async function checkBooking() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking booking...\n');
    console.log(`Booking ID: ${bookingId}`);
    console.log(`Customer Email: ${customerEmail}\n`);
    
    // Check if booking exists
    const bookingCheck = await client.query(
      `SELECT id, customer_email, customer_name, service_id, slot_id, tenant_id, payment_status, total_price, status
       FROM bookings 
       WHERE id = $1 OR customer_email = $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [bookingId, customerEmail]
    );
    
    if (bookingCheck.rows.length === 0) {
      console.log('❌ No booking found with that ID or email');
      console.log('\n💡 Let\'s check all recent bookings:');
      
      const allBookings = await client.query(
        `SELECT id, customer_email, customer_name, created_at, payment_status
         FROM bookings 
         ORDER BY created_at DESC
         LIMIT 10`
      );
      
      if (allBookings.rows.length === 0) {
        console.log('   No bookings found in database');
      } else {
        console.log(`\n   Found ${allBookings.rows.length} recent bookings:`);
        allBookings.rows.forEach((b, i) => {
          console.log(`   ${i + 1}. ID: ${b.id}`);
          console.log(`      Email: ${b.customer_email || 'N/A'}`);
          console.log(`      Name: ${b.customer_name || 'N/A'}`);
          console.log(`      Created: ${b.created_at}`);
          console.log(`      Payment: ${b.payment_status}`);
          console.log('');
        });
      }
      return;
    }
    
    console.log(`✅ Found ${bookingCheck.rows.length} booking(s):\n`);
    
    for (const booking of bookingCheck.rows) {
      console.log(`Booking ID: ${booking.id}`);
      console.log(`Customer Email: ${booking.customer_email || 'N/A'}`);
      console.log(`Customer Name: ${booking.customer_name || 'N/A'}`);
      console.log(`Service ID: ${booking.service_id || 'N/A'}`);
      console.log(`Slot ID: ${booking.slot_id || 'N/A'}`);
      console.log(`Tenant ID: ${booking.tenant_id || 'N/A'}`);
      console.log(`Payment Status: ${booking.payment_status || 'N/A'}`);
      console.log(`Booking Status: ${booking.status || 'N/A'}`);
      console.log(`Total Price: ${booking.total_price || 'N/A'}`);
      console.log('');
      
      // Check related data
      if (booking.service_id) {
        const serviceCheck = await client.query(
          `SELECT id, name FROM services WHERE id = $1`,
          [booking.service_id]
        );
        console.log(`Service: ${serviceCheck.rows.length > 0 ? serviceCheck.rows[0].name : 'NOT FOUND'}`);
      }
      
      if (booking.slot_id) {
        const slotCheck = await client.query(
          `SELECT id, slot_date FROM time_slots WHERE id = $1`,
          [booking.slot_id]
        );
        console.log(`Time Slot: ${slotCheck.rows.length > 0 ? slotCheck.rows[0].slot_date : 'NOT FOUND'}`);
      }
      
      console.log('---\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBooking();

