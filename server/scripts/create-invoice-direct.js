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

async function createInvoiceDirect() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log(`🔍 Finding booking for: ${customerEmail}\n`);
    
    // Find any booking and update email only (don't touch payment_status to avoid trigger)
    const bookingResult = await client.query(
      `SELECT 
        b.id,
        b.tenant_id,
        b.customer_name,
        b.customer_email,
        b.payment_status,
        b.total_price,
        b.zoho_invoice_id
      FROM bookings b
      WHERE b.customer_email IS NOT NULL
      ORDER BY b.created_at DESC
      LIMIT 1`
    );
    
    if (bookingResult.rows.length === 0) {
      console.log('❌ No bookings found');
      return;
    }
    
    const booking = bookingResult.rows[0];
    const bookingId = booking.id;
    const tenantId = booking.tenant_id;
    
    console.log(`📋 Found booking: ${bookingId}`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Current email: ${booking.customer_email}`);
    console.log(`   Payment status: ${booking.payment_status}`);
    
    // Update email only
    await client.query(
      `UPDATE bookings SET customer_email = $1 WHERE id = $2`,
      [customerEmail, bookingId]
    );
    console.log(`✅ Email updated to: ${customerEmail}`);
    
    // Check if already paid
    if (booking.payment_status === 'paid') {
      console.log(`✅ Booking is already paid`);
    } else {
      console.log(`⚠️  Booking payment status is: ${booking.payment_status}`);
      console.log(`   You may need to update it to 'paid' manually or via API`);
    }
    
    // Check Zoho connection
    const tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log(`\n❌ No Zoho connection for tenant ${tenantId}`);
      console.log(`\n💡 Connect Zoho first:`);
      console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      return;
    }
    
    console.log(`\n✅ Zoho connected for tenant`);
    
    // Now call the API to create invoice
    console.log(`\n📧 Creating Zoho invoice via API...\n`);
    
    const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      const response = await fetch(`${API_URL}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          booking_id: bookingId,
        }),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log('✅ Invoice created successfully!');
        console.log(`   Invoice ID: ${result.invoice_id}`);
        console.log(`   Message: ${result.message}`);
        
        // Verify in database
        const verify = await client.query(
          `SELECT zoho_invoice_id, zoho_invoice_created_at FROM bookings WHERE id = $1`,
          [bookingId]
        );
        
        if (verify.rows[0].zoho_invoice_id) {
          console.log(`\n✅ Verified in database:`);
          console.log(`   Zoho Invoice ID: ${verify.rows[0].zoho_invoice_id}`);
          console.log(`   Created at: ${new Date(verify.rows[0].zoho_invoice_created_at).toLocaleString()}`);
        }
      } else {
        console.log('❌ Failed to create invoice:');
        console.log(`   Error: ${result.error || result.message}`);
        console.log(`   Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Error calling API:');
      console.log(`   ${error.message}`);
      console.log(`\n💡 Make sure the server is running:`);
      console.log(`   cd project/server && npm run dev`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createInvoiceDirect().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

