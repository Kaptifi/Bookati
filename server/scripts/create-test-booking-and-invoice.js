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

async function createTestBookingAndInvoice() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log(`🔍 Setting up test booking for: ${customerEmail}\n`);
    
    // First, check if there are any bookings at all
    const allBookingsResult = await client.query(
      `SELECT COUNT(*) as count FROM bookings`
    );
    console.log(`📊 Total bookings in database: ${allBookingsResult.rows[0].count}\n`);
    
    // Find a booking - try to find one that's already paid first, or one with valid status
    let existingBookingResult = await client.query(
      `SELECT 
        b.id,
        b.tenant_id,
        b.customer_name,
        b.customer_email,
        b.payment_status,
        b.total_price,
        b.zoho_invoice_id,
        b.status::text as status_text
      FROM bookings b
      WHERE b.payment_status = 'paid' AND b.zoho_invoice_id IS NULL
      ORDER BY b.created_at DESC
      LIMIT 1`
    );
    
    // If no paid booking found, find any booking
    if (existingBookingResult.rows.length === 0) {
      existingBookingResult = await client.query(
        `SELECT 
          b.id,
          b.tenant_id,
          b.customer_name,
          b.customer_email,
          b.payment_status,
          b.total_price,
          b.zoho_invoice_id,
          b.status::text as status_text
        FROM bookings b
        WHERE b.customer_email IS NOT NULL
        ORDER BY b.created_at DESC
        LIMIT 1`
      );
    }
    
    let bookingId;
    let tenantId;
    
    if (existingBookingResult.rows.length > 0) {
      const booking = existingBookingResult.rows[0];
      bookingId = booking.id;
      tenantId = booking.tenant_id;
      
      console.log(`📋 Found existing booking: ${bookingId}`);
      console.log(`   Current email: ${booking.customer_email || 'NULL'}`);
      console.log(`   Payment status: ${booking.payment_status}`);
      console.log(`   Total price: ${booking.total_price} SAR`);
      
      // Update the booking to use our test email and mark as paid
      console.log(`\n🔄 Updating booking to use test email and mark as paid...`);
      
      // Only update payment_status and customer_email
      // Use explicit casting and avoid triggers if possible
      console.log(`   Updating email and payment status...`);
      
      // First, just update the email
      await client.query(
        `UPDATE bookings 
         SET customer_email = $1, updated_at = now()
         WHERE id = $2`,
        [customerEmail, bookingId]
      );
      
      // Then update payment status separately (this will trigger the Zoho receipt trigger)
      console.log(`   Updating payment status to 'paid' (this will trigger invoice creation)...`);
      await client.query(
        `UPDATE bookings 
         SET payment_status = 'paid'::payment_status, updated_at = now()
         WHERE id = $1`,
        [bookingId]
      );
      
      // Verify update separately
      const updated = await client.query(
        `SELECT id, customer_email, payment_status, zoho_invoice_id 
         FROM bookings 
         WHERE id = $1`,
        [bookingId]
      );
      
      console.log(`✅ Booking updated:`);
      console.log(`   - Email set to: ${customerEmail}`);
      console.log(`   - Payment status: paid`);
      
      // Check if invoice already exists
      const updatedBooking = await client.query(
        `SELECT zoho_invoice_id FROM bookings WHERE id = $1`,
        [bookingId]
      );
      
      if (updatedBooking.rows[0].zoho_invoice_id) {
        console.log(`\n⚠️  This booking already has a Zoho invoice: ${updatedBooking.rows[0].zoho_invoice_id}`);
        console.log('   The trigger should have queued a job, but invoice already exists.');
        console.log('   You can still test by calling the API directly.');
      } else {
        console.log(`\n✅ Booking is ready for invoice creation`);
        console.log(`   - The database trigger should have queued a job`);
        console.log(`   - Or you can call the API to create invoice manually`);
      }
    } else {
      console.log('❌ No bookings found in database');
      console.log('\n💡 You need to create a booking first:');
      console.log('   1. Use the booking system to create a booking');
      console.log('   2. Or create one manually in the database');
      return;
    }
    
    // Check Zoho connection
    console.log(`\n🔍 Checking Zoho connection for tenant: ${tenantId}`);
    
    const tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('❌ No Zoho tokens found for this tenant');
      console.log('\n💡 You need to connect Zoho first:');
      console.log(`   1. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log('   2. Complete OAuth flow');
      console.log('   3. Then the invoice will be created automatically');
      console.log('\n   OR call the API directly (if server is running):');
      console.log(`   POST http://localhost:3001/api/zoho/test-invoice`);
      console.log(`   Body: { "tenant_id": "${tenantId}", "booking_id": "${bookingId}" }`);
      return;
    }
    
    console.log('✅ Zoho tokens found for tenant');
    const token = tokenResult.rows[0];
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const isExpired = expiresAt < now;
    
    console.log(`   - Token status: ${isExpired ? 'EXPIRED' : 'ACTIVE'}`);
    console.log(`   - Expires at: ${expiresAt.toLocaleString()}`);
    
    if (isExpired) {
      console.log('   ⚠️  Token is expired, but will auto-refresh on use');
    }
    
    // Now try to create invoice via API
    console.log(`\n📧 Attempting to create Zoho invoice via API...\n`);
    
    const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      const testResponse = await fetch(`${API_URL}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          booking_id: bookingId,
        }),
      });
      
      if (testResponse.ok) {
        const result = await testResponse.json();
        console.log('✅ Invoice created successfully!');
        console.log(`   Invoice ID: ${result.invoice_id}`);
        console.log(`   Message: ${result.message}`);
        
        // Verify in database
        const verifyResult = await client.query(
          `SELECT zoho_invoice_id, zoho_invoice_created_at FROM bookings WHERE id = $1`,
          [bookingId]
        );
        
        if (verifyResult.rows[0].zoho_invoice_id) {
          console.log(`\n✅ Verified in database:`);
          console.log(`   - Zoho Invoice ID: ${verifyResult.rows[0].zoho_invoice_id}`);
          console.log(`   - Created at: ${new Date(verifyResult.rows[0].zoho_invoice_created_at).toLocaleString()}`);
        }
      } else {
        const error = await testResponse.json();
        console.log('❌ Failed to create invoice:');
        console.log(`   Error: ${error.error || error.message}`);
        console.log(`   Status: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Error calling API:');
      console.log(`   ${error.message}`);
      console.log('\n💡 Make sure the server is running:');
      console.log('   cd project/server && npm run dev');
      console.log('\n   Then run this script again.');
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

createTestBookingAndInvoice().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

