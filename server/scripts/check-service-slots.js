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

async function checkServiceSlots() {
  try {
    const client = await pool.connect();
    
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n=== Checking services without slots for today (${todayStr}) ===\n`);
    
    // Get all active services
    const servicesQuery = `
      SELECT id, name, name_ar, is_active, created_at
      FROM services
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const servicesResult = await client.query(servicesQuery);
    
    if (servicesResult.rows.length === 0) {
      console.log('❌ No active services found');
      await client.release();
      await pool.end();
      return;
    }
    
    console.log(`Found ${servicesResult.rows.length} active service(s):\n`);
    
    for (const service of servicesResult.rows) {
      console.log(`\n📋 Service: ${service.name} (ID: ${service.id})`);
      console.log(`   Created: ${service.created_at}`);
      
      // Check for shifts
      const shiftsQuery = `
        SELECT id, days_of_week, start_time_utc, end_time_utc, is_active
        FROM shifts
        WHERE service_id = $1
        ORDER BY is_active DESC, created_at DESC
      `;
      
      const shiftsResult = await client.query(shiftsQuery, [service.id]);
      
      if (shiftsResult.rows.length === 0) {
        console.log(`   ❌ NO SHIFTS - This service has no shifts!`);
        console.log(`   💡 Solution: Create a shift for this service with days_of_week, start_time_utc, and end_time_utc`);
        continue;
      }
      
      const activeShifts = shiftsResult.rows.filter(s => s.is_active);
      console.log(`   ✅ Shifts: ${shiftsResult.rows.length} total (${activeShifts.length} active)`);
      
      if (activeShifts.length === 0) {
        console.log(`   ⚠️  No active shifts - All shifts are inactive!`);
        continue;
      }
      
      // Check for slots today
      const shiftIds = activeShifts.map(s => s.id);
      const slotsQuery = `
        SELECT COUNT(*) as count
        FROM slots
        WHERE shift_id = ANY($1)
          AND DATE(slot_date) = $2
          AND is_available = true
      `;
      
      const slotsResult = await client.query(slotsQuery, [shiftIds, todayStr]);
      const slotCount = parseInt(slotsResult.rows[0].count);
      
      if (slotCount === 0) {
        console.log(`   ❌ NO SLOTS FOR TODAY - This service has no slots for ${todayStr}`);
        console.log(`   💡 Solution: Run slot generation for this service's shifts`);
        
        // Check if there are any slots at all
        const allSlotsQuery = `
          SELECT COUNT(*) as count, MIN(slot_date) as first_date, MAX(slot_date) as last_date
          FROM slots
          WHERE shift_id = ANY($1)
            AND is_available = true
        `;
        
        const allSlotsResult = await client.query(allSlotsQuery, [shiftIds]);
        const allSlotCount = parseInt(allSlotsResult.rows[0].count);
        
        if (allSlotCount === 0) {
          console.log(`   ❌ NO SLOTS AT ALL - This service has never had slots generated`);
        } else {
          console.log(`   ℹ️  Has ${allSlotCount} slots total (first: ${allSlotsResult.rows[0].first_date}, last: ${allSlotsResult.rows[0].last_date})`);
        }
        
        // Show shift details
        console.log(`   📅 Active shift details:`);
        activeShifts.forEach(shift => {
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayNames = shift.days_of_week.map(d => days[d]).join(', ');
          console.log(`      - Shift ${shift.id.substring(0, 8)}...`);
          console.log(`        Days: [${dayNames}]`);
          console.log(`        Time: ${shift.start_time_utc} - ${shift.end_time_utc}`);
        });
      } else {
        // Check available capacity
        const capacityQuery = `
          SELECT 
            COUNT(*) as total_slots,
            SUM(available_capacity) as total_capacity,
            SUM(booked_count) as total_booked
          FROM slots
          WHERE shift_id = ANY($1)
            AND DATE(slot_date) = $2
            AND is_available = true
        `;
        
        const capacityResult = await client.query(capacityQuery, [shiftIds, todayStr]);
        const totalCapacity = parseInt(capacityResult.rows[0].total_capacity || 0);
        const totalBooked = parseInt(capacityResult.rows[0].total_booked || 0);
        
        console.log(`   ✅ Slots for today: ${slotCount} slots, ${totalCapacity} available capacity, ${totalBooked} booked`);
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

checkServiceSlots();









