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

const slotId = process.argv[2];

if (!slotId) {
  console.log('Usage: node check-slot-capacity.js <slot_id>');
  console.log('Example: node check-slot-capacity.js 123e4567-e89b-12d3-a456-426614174000');
  process.exit(1);
}

async function checkSlotCapacity() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Slot Capacity\n');
    console.log('='.repeat(60));
    console.log(`Slot ID: ${slotId}\n`);

    // Get slot details
    const slotResult = await client.query(
      `SELECT 
        s.id,
        s.slot_date,
        s.start_time,
        s.end_time,
        s.available_capacity,
        s.booked_count,
        s.original_capacity,
        s.is_available,
        s.is_overbooked,
        s.employee_id,
        s.shift_id,
        sv.id as service_id,
        sv.name as service_name,
        sv.capacity_mode,
        sv.service_capacity_per_slot,
        u.capacity_per_slot as employee_capacity,
        sh.days_of_week
      FROM slots s
      JOIN shifts sh ON s.shift_id = sh.id
      JOIN services sv ON sh.service_id = sv.id
      LEFT JOIN users u ON s.employee_id = u.id
      WHERE s.id = $1`,
      [slotId]
    );

    if (slotResult.rows.length === 0) {
      console.log('❌ Slot not found');
      return;
    }

    const slot = slotResult.rows[0];

    console.log('📋 Slot Details:');
    console.log(`   Date: ${slot.slot_date}`);
    console.log(`   Time: ${slot.start_time} - ${slot.end_time}`);
    console.log(`   Service: ${slot.service_name} (${slot.service_id})`);
    console.log(`   Capacity Mode: ${slot.capacity_mode}`);
    console.log(`   Service Capacity: ${slot.service_capacity_per_slot || 'N/A'}`);
    console.log(`   Employee Capacity: ${slot.employee_capacity || 'N/A'}`);
    console.log(`   Employee ID: ${slot.employee_id || 'N/A'}`);
    console.log('');

    console.log('📊 Capacity Information:');
    console.log(`   Original Capacity: ${slot.original_capacity}`);
    console.log(`   Available Capacity: ${slot.available_capacity}`);
    console.log(`   Booked Count: ${slot.booked_count}`);
    console.log(`   Is Available: ${slot.is_available}`);
    console.log(`   Is Overbooked: ${slot.is_overbooked}`);
    console.log('');

    // Check bookings for this slot
    const bookingsResult = await client.query(
      `SELECT 
        id,
        customer_name,
        visitor_count,
        status,
        created_at
      FROM bookings
      WHERE slot_id = $1
      ORDER BY created_at DESC`,
      [slotId]
    );

    console.log(`📝 Bookings (${bookingsResult.rows.length}):`);
    if (bookingsResult.rows.length > 0) {
      bookingsResult.rows.forEach((booking, index) => {
        console.log(`   ${index + 1}. ${booking.customer_name} - ${booking.visitor_count} visitors (${booking.status})`);
      });
    } else {
      console.log('   No bookings found');
    }
    console.log('');

    // Check active locks
    const locksResult = await client.query(
      `SELECT 
        id,
        reserved_capacity,
        lock_expires_at,
        reserved_by_session_id
      FROM booking_locks
      WHERE slot_id = $1 AND lock_expires_at > now()`,
      [slotId]
    );

    console.log(`🔒 Active Locks (${locksResult.rows.length}):`);
    if (locksResult.rows.length > 0) {
      locksResult.rows.forEach((lock, index) => {
        console.log(`   ${index + 1}. ${lock.reserved_capacity} tickets (expires: ${lock.lock_expires_at})`);
      });
    } else {
      console.log('   No active locks');
    }
    console.log('');

    // Diagnosis
    console.log('🔍 Diagnosis:');
    if (slot.available_capacity === 0) {
      if (slot.booked_count >= slot.original_capacity) {
        console.log('   ⚠️ Slot is fully booked');
        console.log(`   Booked: ${slot.booked_count}, Capacity: ${slot.original_capacity}`);
      } else if (slot.original_capacity === 0 || slot.original_capacity === null) {
        console.log('   ⚠️ Slot has no original capacity set');
        console.log('   This is likely a slot generation issue');
      } else {
        console.log('   ⚠️ Available capacity is 0 but slot is not fully booked');
        console.log(`   This suggests a capacity calculation issue`);
        console.log(`   Expected: ${slot.original_capacity - slot.booked_count}`);
        console.log(`   Actual: ${slot.available_capacity}`);
      }
    } else {
      console.log('   ✅ Slot has available capacity');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSlotCapacity();

