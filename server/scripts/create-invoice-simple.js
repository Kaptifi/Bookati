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

async function createInvoice() {
  const client = await pool.connect();
  
  try {
    const customerEmail = 'kaptifidev@gmail.com';
    
    console.log(`🔍 Finding booking for: ${customerEmail}\n`);
    
    // First, check if there's already a booking with this email
    let bookingResult = await client.query(
      `SELECT 
        b.id,
        b.tenant_id,
        b.customer_name,
        b.customer_email,
        b.payment_status,
        b.total_price,
        b.zoho_invoice_id
      FROM bookings b
      WHERE b.customer_email = $1
      ORDER BY b.created_at DESC
      LIMIT 1`,
      [customerEmail]
    );
    
    let bookingId, tenantId;
    
    if (bookingResult.rows.length > 0) {
      const booking = bookingResult.rows[0];
      bookingId = booking.id;
      tenantId = booking.tenant_id;
      
      console.log(`✅ Found booking with this email: ${bookingId}`);
      console.log(`   Customer: ${booking.customer_name}`);
      console.log(`   Payment status: ${booking.payment_status}`);
      console.log(`   Total price: ${booking.total_price} SAR`);
      
      if (booking.zoho_invoice_id) {
        console.log(`\n⚠️  This booking already has a Zoho invoice: ${booking.zoho_invoice_id}`);
        console.log('   Invoice already created!');
        return;
      }
    } else {
      // Find any booking and we'll update it via raw SQL to avoid trigger issues
      console.log(`⚠️  No booking found with this email`);
      console.log(`   Finding any booking to use for testing...\n`);
      
      bookingResult = await client.query(
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
        console.log('❌ No bookings found in database');
        return;
      }
      
      const booking = bookingResult.rows[0];
      bookingId = booking.id;
      tenantId = booking.tenant_id;
      
      console.log(`📋 Using booking: ${bookingId}`);
      console.log(`   Current email: ${booking.customer_email}`);
      console.log(`   Will update to: ${customerEmail}`);
      
      // Use raw SQL with explicit casting to avoid enum issues
      try {
        await client.query(`
          UPDATE bookings 
          SET customer_email = $1
          WHERE id = $2
        `, [customerEmail, bookingId]);
        console.log(`✅ Email updated`);
      } catch (updateError) {
        console.log(`⚠️  Could not update email: ${updateError.message}`);
        console.log(`   Will proceed with existing email: ${booking.customer_email}`);
        // Continue with existing email
      }
    }
    
    const booking = bookingResult.rows[0];
    tenantId = booking.tenant_id;
    
    // Check Zoho connection
    console.log(`\n🔍 Checking Zoho connection for tenant: ${tenantId}`);
    
    const tokenResult = await client.query(
      `SELECT * FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('❌ No Zoho tokens found for this tenant');
      console.log(`\n💡 Connect Zoho first:`);
      console.log(`   http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log(`\n   Then run this script again.`);
      return;
    }
    
    console.log('✅ Zoho tokens found');
    const token = tokenResult.rows[0];
    const expiresAt = new Date(token.expires_at);
    console.log(`   Token expires: ${expiresAt.toLocaleString()}`);
    
    // Call API to create invoice
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
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.log('❌ Failed to create invoice:');
        console.log(`   Status: ${response.status}`);
        console.log(`   Error: ${errorData.error || errorData.message || errorText.substring(0, 200)}`);
        
        if (response.status === 500) {
          console.log(`\n💡 The server might not be running. Start it with:`);
          console.log(`   cd project/server && npm run dev`);
        }
        return;
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Invoice created successfully!');
        console.log(`   Invoice ID: ${result.invoice_id}`);
        console.log(`   Message: ${result.message}`);
        
        // Verify in database
        const verify = await client.query(
          `SELECT zoho_invoice_id, zoho_invoice_created_at, customer_email 
           FROM bookings 
           WHERE id = $1`,
          [bookingId]
        );
        
        if (verify.rows[0].zoho_invoice_id) {
          console.log(`\n✅ Verified in database:`);
          console.log(`   Booking ID: ${bookingId}`);
          console.log(`   Customer Email: ${verify.rows[0].customer_email}`);
          console.log(`   Zoho Invoice ID: ${verify.rows[0].zoho_invoice_id}`);
          console.log(`   Created at: ${new Date(verify.rows[0].zoho_invoice_created_at).toLocaleString()}`);
          console.log(`\n📧 Invoice should be sent to: ${verify.rows[0].customer_email}`);
        }
      } else {
        console.log('❌ Invoice creation failed:');
        console.log(`   Error: ${result.error || result.message}`);
      }
    } catch (error) {
      console.log('❌ Error calling API:');
      console.log(`   ${error.message}`);
      console.log(`\n💡 Make sure the server is running:`);
      console.log(`   cd project/server && npm run dev`);
      console.log(`\n   Then run this script again.`);
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

createInvoice().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

