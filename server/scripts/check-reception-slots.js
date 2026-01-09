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

async function checkReceptionSlots() {
  try {
    const client = await pool.connect();
    
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Service ID from the URL
    const serviceId = 'e3a1bf1f-307a-4eb3-8309-c8be8acbe8ce';
    
    console.log(`\n=== Checking slots for reception page ===\n`);
    console.log(`Service ID: ${serviceId}`);
    console.log(`Date: ${todayStr}\n`);
    
    // Get shifts for this service
    const shiftsQuery = `
      SELECT id, days_of_week, start_time_utc, end_time_utc, is_active
      FROM shifts
      WHERE service_id = $1
        AND is_active = true
    `;
    
    const shiftsResult = await client.query(shiftsQuery, [serviceId]);
    
    if (shiftsResult.rows.length === 0) {
      console.log('❌ No active shifts found for this service');
      await client.release();
      await pool.end();
      return;
    }
    
    console.log(`Found ${shiftsResult.rows.length} active shift(s):\n`);
    shiftsResult.rows.forEach((shift, idx) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayNames = shift.days_of_week.map(d => days[d]).join(', ');
      console.log(`Shift ${idx + 1}:`);
      console.log(`  ID: ${shift.id}`);
      console.log(`  Days: [${dayNames}] (${shift.days_of_week.join(', ')})`);
      console.log(`  Time: ${shift.start_time_utc} - ${shift.end_time_utc}`);
      console.log('');
    });
    
    // Get all slots for today
    const shiftIds = shiftsResult.rows.map(s => s.id);
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
        AND is_available = true
      ORDER BY start_time
    `;
    
    const slotsResult = await client.query(slotsQuery, [shiftIds, todayStr]);
    
    console.log(`\n=== All slots for today ===\n`);
    console.log(`Total slots: ${slotsResult.rows.length}\n`);
    
    if (slotsResult.rows.length > 0) {
      slotsResult.rows.forEach((slot, idx) => {
        const [hours, minutes] = slot.start_time.split(':').map(Number);
        const slotTime = hours * 60 + minutes;
        const isInRange = slotTime >= 19 * 60 && slotTime < 22 * 60; // 7pm to 10pm
        
        console.log(`Slot ${idx + 1}:`);
        console.log(`  ID: ${slot.id}`);
        console.log(`  Time: ${slot.start_time} - ${slot.end_time} (${hours}:${String(minutes).padStart(2, '0')} = ${slotTime} min)`);
        console.log(`  In 7pm-10pm range: ${isInRange ? '✅ YES' : '❌ NO'}`);
        console.log(`  Capacity: ${slot.available_capacity} available / ${slot.original_capacity} total (${slot.booked_count} booked)`);
        console.log(`  Shift: ${slot.shift_id.substring(0, 8)}...`);
        console.log('');
      });
      
      // Filter slots in 7pm-10pm range
      const slotsInRange = slotsResult.rows.filter(slot => {
        const [hours, minutes] = slot.start_time.split(':').map(Number);
        const slotTime = hours * 60 + minutes;
        return slotTime >= 19 * 60 && slotTime < 22 * 60; // 7pm to 10pm
      });
      
      console.log(`\n=== Slots in 7pm-10pm range ===\n`);
      console.log(`Total: ${slotsInRange.length} slot(s)\n`);
      
      if (slotsInRange.length === 0) {
        console.log('⚠️  No slots found in 7pm-10pm range!');
        console.log('💡 Solution: Create slots for this time range or adjust the shift times');
      } else {
        slotsInRange.forEach((slot, idx) => {
          console.log(`Slot ${idx + 1}: ${slot.start_time} - ${slot.end_time} (capacity: ${slot.available_capacity})`);
        });
      }
    } else {
      console.log('❌ No slots found for today');
    }
    
    await client.release();
    await pool.end();
    
    console.log('\n✅ Check completed\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkReceptionSlots();









