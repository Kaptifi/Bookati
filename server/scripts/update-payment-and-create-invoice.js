/**
 * Update payment status to 'paid' and trigger invoice creation
 */

import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

const bookingId = process.argv[2];

if (!bookingId) {
  console.log('Usage: node update-payment-and-create-invoice.js <booking_id>');
  console.log('Example: node update-payment-and-create-invoice.js db5c3ee3-2c28-40af-92f5-d47ee420402d');
  process.exit(1);
}

async function updatePaymentAndCreateInvoice() {
  const client = await pool.connect();
  try {
    console.log('💰 Updating Payment Status and Creating Invoice\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);
    
    // Get booking details
    const bookingResult = await client.query(
      `SELECT id, customer_name, customer_email, payment_status, zoho_invoice_id, tenant_id
       FROM bookings WHERE id = $1`,
      [bookingId]
    );
    
    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }
    
    const booking = bookingResult.rows[0];
    
    console.log(`Customer: ${booking.customer_name}`);
    console.log(`Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`Current Payment Status: ${booking.payment_status}`);
    console.log(`Current Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
    console.log('');
    
    if (booking.payment_status === 'paid' && booking.zoho_invoice_id) {
      console.log('✅ Payment is already paid and invoice exists');
      console.log(`   Invoice ID: ${booking.zoho_invoice_id}`);
      return;
    }
    
    // Update payment status
    console.log('📋 Step 1: Updating payment status to "paid"...');
    await client.query(
      `UPDATE bookings 
       SET payment_status = 'paid', updated_at = now()
       WHERE id = $1`,
      [bookingId]
    );
    console.log('✅ Payment status updated to "paid"');
    console.log('   Database trigger will queue invoice creation job');
    
    // Wait a bit for trigger to fire
    console.log('\n⏳ Waiting 2 seconds for trigger to queue job...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if invoice was created
    console.log('\n📋 Step 2: Checking invoice creation...');
    
    // Wait for worker to process (up to 30 seconds)
    let invoiceId = null;
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const checkResult = await client.query(
        `SELECT zoho_invoice_id FROM bookings WHERE id = $1`,
        [bookingId]
      );
      
      if (checkResult.rows[0].zoho_invoice_id) {
        invoiceId = checkResult.rows[0].zoho_invoice_id;
        break;
      }
      
      console.log(`   Checking... (${(i + 1) * 5} seconds)`);
    }
    
    if (invoiceId) {
      console.log(`✅ Invoice created: ${invoiceId}`);
      console.log('   Invoice should be sent via Zoho to customer email');
    } else {
      console.log('⚠️  Invoice not created yet');
      console.log('   The Zoho worker processes jobs every 30 seconds');
      console.log('   Check zoho_invoice_logs table for status');
      console.log('   Or run: node scripts/create-invoice-simple-api.js');
    }
    
    // Check invoice logs
    const logResult = await client.query(
      `SELECT status, error_message, created_at 
       FROM zoho_invoice_logs 
       WHERE booking_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [bookingId]
    );
    
    if (logResult.rows.length > 0) {
      const log = logResult.rows[0];
      console.log(`\n📋 Invoice Log Status: ${log.status}`);
      if (log.error_message) {
        console.log(`   Error: ${log.error_message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

updatePaymentAndCreateInvoice();

