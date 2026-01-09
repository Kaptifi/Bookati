/**
 * Create Invoice for Booking - Email Focus
 * 
 * Creates invoice for a booking and ensures email is sent
 * Usage: node scripts/create-invoice-for-booking-email.js <booking-id>
 */

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

const bookingId = process.argv[2];

if (!bookingId) {
  console.error('❌ Please provide a booking ID');
  console.error('Usage: node scripts/create-invoice-for-booking-email.js <booking-id>');
  process.exit(1);
}

async function createInvoiceForBooking() {
  const client = await pool.connect();
  
  try {
    console.log(`📧 Creating invoice for booking: ${bookingId}\n`);

    // Get booking
    const booking = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        zoho_invoice_id,
        tenant_id
      FROM bookings
      WHERE id = $1`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      console.error(`❌ Booking ${bookingId} not found`);
      return;
    }

    const b = booking.rows[0];
    console.log(`📋 Booking Details:`);
    console.log(`   Customer: ${b.customer_name}`);
    console.log(`   Email: ${b.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Phone: ${b.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Invoice ID: ${b.zoho_invoice_id || 'NOT CREATED'}\n`);

    if (b.zoho_invoice_id) {
      console.log(`✅ Invoice already exists: ${b.zoho_invoice_id}`);
      console.log(`   Attempting to send email...\n`);
    } else {
      console.log(`📧 Creating invoice...\n`);
    }

    // Use tsx to run TypeScript
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Call the API endpoint instead
    const API_URL = process.env.API_URL || 'http://localhost:3001';
    
    try {
      const fetch = (await import('node-fetch')).default;
      
      console.log(`📤 Calling API to create invoice...`);
      const response = await fetch(`${API_URL}/api/zoho/test-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: b.tenant_id,
          booking_id: b.id,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Invoice created: ${result.invoice_id}`);
        console.log(`\n📧 Email should be sent automatically if email is provided`);
        console.log(`   Check server logs for email delivery status`);
      } else {
        console.error(`❌ Failed to create invoice: ${result.error}`);
      }
    } catch (apiError) {
      console.error(`❌ API call failed: ${apiError.message}`);
      console.log(`\n💡 Alternative: Check server logs when booking is created`);
      console.log(`   The invoice should be created automatically on booking creation`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

createInvoiceForBooking();

