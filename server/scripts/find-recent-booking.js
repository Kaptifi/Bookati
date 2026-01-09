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

async function findRecentBooking() {
  const client = await pool.connect();
  try {
    console.log('🔍 Finding Recent Bookings\n');
    console.log('='.repeat(60));
    
    // Get recent bookings
    const result = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        zoho_invoice_id,
        created_at
      FROM bookings
      ORDER BY created_at DESC
      LIMIT 5`
    );

    if (result.rows.length === 0) {
      console.log('❌ No bookings found');
      return;
    }

    console.log(`Found ${result.rows.length} recent booking(s):\n`);
    
    result.rows.forEach((booking, index) => {
      console.log(`${index + 1}. Booking ID: ${booking.id}`);
      console.log(`   Customer: ${booking.customer_name}`);
      console.log(`   Email: ${booking.customer_email || 'NOT PROVIDED'}`);
      console.log(`   Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
      console.log(`   Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
      console.log(`   Created: ${booking.created_at}`);
      console.log('');
    });

    if (result.rows.length > 0) {
      const latestBooking = result.rows[0];
      console.log('📋 To debug the latest booking, run:');
      console.log(`   node scripts/debug-invoice-delivery.js ${latestBooking.id}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

findRecentBooking();

