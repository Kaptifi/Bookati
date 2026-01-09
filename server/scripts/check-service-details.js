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

async function checkServiceDetails() {
  try {
    const client = await pool.connect();
    
    // Find the service
    const serviceName = 'http://localhost:5173/tour/reception';
    const serviceQuery = `
      SELECT id, name, name_ar, is_active, created_at
      FROM services
      WHERE name = $1 OR name_ar = $1
      LIMIT 1
    `;
    
    const serviceResult = await client.query(serviceQuery, [serviceName]);
    
    if (serviceResult.rows.length === 0) {
      console.log('❌ Service not found');
      await client.release();
      await pool.end();
      return;
    }
    
    const service = serviceResult.rows[0];
    console.log(`\n=== Service Details ===\n`);
    console.log(`Service: ${service.name} (ID: ${service.id})\n`);
    
    // Get shifts
    const shiftsQuery = `
      SELECT id, days_of_week, start_time_utc, end_time_utc, is_active
      FROM shifts
      WHERE service_id = $1
      ORDER BY is_active DESC
    `;
    
    const shiftsResult = await client.query(shiftsQuery, [service.id]);
    console.log(`Shifts: ${shiftsResult.rows.length}\n`);
    
    shiftsResult.rows.forEach((shift, idx) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayNames = shift.days_of_week.map(d => days[d]).join(', ');
      console.log(`Shift ${idx + 1}:`);
      console.log(`  ID: ${shift.id}`);
      console.log(`  Days: [${dayNames}] (${shift.days_of_week.join(', ')})`);
      console.log(`  Time: ${shift.start_time_utc} - ${shift.end_time_utc}`);
      console.log(`  Active: ${shift.is_active}`);
      console.log('');
    });
    
    // Get today's date and day of week
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    console.log(`Today: ${todayStr} (${days[dayOfWeek]}, day ${dayOfWeek})\n`);
    
    // Get slots for today
    const activeShifts = shiftsResult.rows.filter(s => s.is_active);
    if (activeShifts.length > 0) {
      const shiftIds = activeShifts.map(s => s.id);
      
      // Check which shifts match today
      console.log(`Checking which shifts match today:\n`);
      activeShifts.forEach(shift => {
        const matches = shift.days_of_week.includes(dayOfWeek);
        console.log(`  Shift ${shift.id.substring(0, 8)}...: ${matches ? '✅ MATCHES' : '❌ DOES NOT MATCH'}`);
        console.log(`    Days: [${shift.days_of_week.join(', ')}], Today: ${dayOfWeek}`);
      });
      
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
      
      console.log(`\nSlots for today: ${slotsResult.rows.length}\n`);
      
      if (slotsResult.rows.length > 0) {
        slotsResult.rows.forEach((slot, idx) => {
          const shift = activeShifts.find(s => s.id === slot.shift_id);
          const shiftMatches = shift && shift.days_of_week.includes(dayOfWeek);
          console.log(`Slot ${idx + 1}:`);
          console.log(`  ID: ${slot.id}`);
          console.log(`  Time: ${slot.start_time} - ${slot.end_time}`);
          console.log(`  Capacity: ${slot.available_capacity} available / ${slot.original_capacity} total (${slot.booked_count} booked)`);
          console.log(`  Shift: ${slot.shift_id.substring(0, 8)}... ${shiftMatches ? '✅ MATCHES TODAY' : '❌ DOES NOT MATCH TODAY'}`);
          console.log('');
        });
      } else {
        console.log('❌ No slots found for today\n');
      }
    }
    
    await client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkServiceDetails();









