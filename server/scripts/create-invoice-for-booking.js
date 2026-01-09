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

async function createInvoiceForBooking() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log(`🔍 Searching for bookings with email: ${customerEmail}\n`);
    
    // Find bookings for this email
    const bookingsResult = await client.query(
      `SELECT 
        b.id,
        b.tenant_id,
        b.customer_name,
        b.customer_email,
        b.total_price,
        b.payment_status,
        COALESCE(b.zoho_invoice_id, '') as zoho_invoice_id,
        b.created_at,
        s.name as service_name,
        s.name_ar as service_name_ar,
        ts.start_time_utc,
        ts.end_time_utc
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN time_slots ts ON b.slot_id = ts.id
      WHERE b.customer_email = $1
      ORDER BY b.created_at DESC
      LIMIT 5`,
      [customerEmail]
    );
    
    if (bookingsResult.rows.length === 0) {
      console.log('❌ No bookings found for this email');
      console.log('\n💡 You may need to:');
      console.log('   1. Create a booking with this email first');
      console.log('   2. Or check if the email is correct');
      return;
    }
    
    console.log(`✅ Found ${bookingsResult.rows.length} booking(s):\n`);
    
    bookingsResult.rows.forEach((booking, index) => {
      console.log(`${index + 1}. Booking ID: ${booking.id}`);
      console.log(`   Customer: ${booking.customer_name}`);
      console.log(`   Service: ${booking.service_name || booking.service_name_ar}`);
      console.log(`   Price: ${booking.total_price} SAR`);
      console.log(`   Payment Status: ${booking.payment_status}`);
      console.log(`   Zoho Invoice: ${booking.zoho_invoice_id || 'Not created'}`);
      console.log(`   Created: ${new Date(booking.created_at).toLocaleString()}`);
      console.log('');
    });
    
    // Find a booking that's paid and doesn't have a Zoho invoice yet
    const paidBooking = bookingsResult.rows.find(b => 
      b.payment_status === 'paid' && !b.zoho_invoice_id
    );
    
    // Or use the most recent booking
    const targetBooking = paidBooking || bookingsResult.rows[0];
    
    console.log(`\n📋 Selected booking for invoice creation:`);
    console.log(`   Booking ID: ${targetBooking.id}`);
    console.log(`   Customer: ${targetBooking.customer_name}`);
    console.log(`   Email: ${targetBooking.customer_email}`);
    console.log(`   Payment Status: ${targetBooking.payment_status}`);
    
    if (targetBooking.zoho_invoice_id) {
      console.log(`\n⚠️  This booking already has a Zoho invoice: ${targetBooking.zoho_invoice_id}`);
      console.log('   Skipping invoice creation.');
      return;
    }
    
    // Check if tenant has Zoho tokens
    console.log(`\n🔍 Checking Zoho connection for tenant: ${targetBooking.tenant_id}`);
    
    const tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [targetBooking.tenant_id]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('❌ No Zoho tokens found for this tenant');
      console.log('\n💡 You need to connect Zoho first:');
      console.log(`   1. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${targetBooking.tenant_id}`);
      console.log('   2. Complete OAuth flow');
      console.log('   3. Then run this script again');
      return;
    }
    
    console.log('✅ Zoho tokens found for tenant');
    
    // Now we need to use the Zoho service to create the invoice
    // Since we're in a script, we'll need to import and use the service
    console.log('\n📧 Creating Zoho invoice...\n');
    
    // Import the Zoho service
    // Note: We need to use the compiled version or run with tsx
    try {
      // Try to use the service directly via API call
      const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
      const testResponse = await fetch(`${API_URL}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: targetBooking.tenant_id,
          booking_id: targetBooking.id,
        }),
      });
      
      if (testResponse.ok) {
        const result = await testResponse.json();
        console.log('✅ Invoice created successfully!');
        console.log(`   Invoice ID: ${result.invoice_id}`);
        console.log(`   Message: ${result.message}`);
      } else {
        const error = await testResponse.json();
        console.log('❌ Failed to create invoice:');
        console.log(`   Error: ${error.error || error.message}`);
      }
    } catch (error) {
      console.log('❌ Error calling API:');
      console.log(`   ${error.message}`);
      console.log('\n💡 Make sure the server is running:');
      console.log('   cd project/server && npm run dev');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

createInvoiceForBooking().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

