import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkSlotsCapacity() {
  try {
    const client = await pool.connect();
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n=== Checking slots for today (${todayStr}) ===\n`);
    
    // First, find the service "At The Top Experience"
    const serviceQuery = `
      SELECT id, name, name_ar 
      FROM services 
      WHERE LOWER(name) LIKE '%at the top%' OR LOWER(name_ar) LIKE '%at the top%'
      LIMIT 1
    `;
    
    const serviceResult = await client.query(serviceQuery);
    
    if (serviceResult.rows.length === 0) {
      console.log('❌ Service "At The Top Experience" not found');
      await client.release();
      await pool.end();
      return;
    }
    
    const service = serviceResult.rows[0];
    console.log(`✅ Found service: ${service.name} (ID: ${service.id})\n`);
    
    // Get shifts for this service
    const shiftsQuery = `
      SELECT id, days_of_week, start_time_utc, end_time_utc, is_active
      FROM shifts
      WHERE service_id = $1 AND is_active = true
    `;
    
    const shiftsResult = await client.query(shiftsQuery, [service.id]);
    console.log(`Found ${shiftsResult.rows.length} active shift(s)\n`);
    
    if (shiftsResult.rows.length === 0) {
      console.log('❌ No active shifts found for this service');
      await client.release();
      await pool.end();
      return;
    }
    
    const shiftIds = shiftsResult.rows.map(s => s.id);
    
    // Get slots for today for these shifts, specifically for 7pm and 8pm
    const slotsQuery = `
      SELECT 
        id,
        slot_date,
        start_time,
        end_time,
        available_capacity,
        booked_count,
        original_capacity,
        is_available,
        shift_id
      FROM slots
      WHERE shift_id = ANY($1)
        AND DATE(slot_date) = $2
        AND (start_time = '18:00:00' OR start_time = '19:00:00' OR start_time = '20:00:00')
        AND is_available = true
      ORDER BY start_time
    `;
    
    const slotsResult = await client.query(slotsQuery, [shiftIds, todayStr]);
    
    console.log(`\n=== Slots for 6pm-7pm, 7pm-8pm, and 8pm-9pm today ===\n`);
    
    if (slotsResult.rows.length === 0) {
      console.log('❌ No slots found for these times today');
      
      // Check if there are any slots for today at all
      const allSlotsQuery = `
        SELECT 
          id,
          slot_date,
          start_time,
          end_time,
          available_capacity,
          booked_count,
          original_capacity,
          is_available
        FROM slots
        WHERE shift_id = ANY($1)
          AND DATE(slot_date) = $2
          AND is_available = true
        ORDER BY start_time
      `;
      
      const allSlotsResult = await client.query(allSlotsQuery, [shiftIds, todayStr]);
      console.log(`\nTotal slots for today: ${allSlotsResult.rows.length}`);
      if (allSlotsResult.rows.length > 0) {
        console.log('\nAll slots for today:');
        allSlotsResult.rows.forEach(slot => {
          console.log(`  ${slot.start_time} - ${slot.end_time}: capacity=${slot.available_capacity}, booked=${slot.booked_count}, total=${slot.original_capacity}`);
        });
      }
    } else {
      slotsResult.rows.forEach(slot => {
        const status = slot.available_capacity > 0 ? '✅ AVAILABLE' : '❌ FULL';
        console.log(`${status} ${slot.start_time} - ${slot.end_time}`);
        console.log(`   Slot ID: ${slot.id}`);
        console.log(`   Available Capacity: ${slot.available_capacity}`);
        console.log(`   Booked Count: ${slot.booked_count}`);
        console.log(`   Original Capacity: ${slot.original_capacity || 'N/A'}`);
        console.log(`   Is Available: ${slot.is_available}`);
        console.log(`   Date: ${slot.slot_date}`);
        console.log('');
      });
      
      // Check recent bookings for these slots
      console.log('\n=== Recent bookings for these slots ===\n');
      
      const slotIds = slotsResult.rows.map(s => s.id);
      if (slotIds.length > 0) {
        const bookingsQuery = `
          SELECT 
            b.id,
            s.slot_date as booking_date,
            b.visitor_count,
            b.customer_name,
            b.customer_phone,
            b.status,
            b.created_at
          FROM bookings b
          JOIN slots s ON b.slot_id = s.id
          WHERE b.slot_id = ANY($1)
            AND b.status != 'cancelled'
          ORDER BY b.created_at DESC
          LIMIT 20
        `;
        
        const bookingsResult = await client.query(bookingsQuery, [slotIds]);
        
        if (bookingsResult.rows.length > 0) {
          console.log(`Found ${bookingsResult.rows.length} recent booking(s):\n`);
          bookingsResult.rows.forEach(booking => {
            console.log(`  Booking ID: ${booking.id}`);
            console.log(`  Date: ${booking.booking_date}`);
            console.log(`  Visitors: ${booking.visitor_count}`);
            console.log(`  Customer: ${booking.customer_name} (${booking.customer_phone})`);
            console.log(`  Status: ${booking.status}`);
            console.log(`  Created: ${booking.created_at}`);
            console.log('');
          });
        } else {
          console.log('No bookings found for these slots');
        }
      }
    }
    
    await client.release();
    await pool.end();
    
    console.log('\n✅ Check completed\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSlotsCapacity();

