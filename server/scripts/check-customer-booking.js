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

// Get the most recent booking for a customer (you can modify this)
const customerEmail = process.argv[2] || null;

async function checkBooking() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Customer Booking\n');
    console.log('='.repeat(60));
    
    let query, params;
    if (customerEmail) {
      query = `SELECT id, customer_name, customer_email, customer_phone, payment_status, 
                     zoho_invoice_id, zoho_invoice_created_at, created_at, total_price
              FROM bookings 
              WHERE customer_email = $1
              ORDER BY created_at DESC
              LIMIT 5`;
      params = [customerEmail];
      console.log(`Searching for bookings with email: ${customerEmail}\n`);
    } else {
      query = `SELECT id, customer_name, customer_email, customer_phone, payment_status, 
                     zoho_invoice_id, zoho_invoice_created_at, created_at, total_price
              FROM bookings 
              ORDER BY created_at DESC
              LIMIT 5`;
      params = [];
      console.log('Getting 5 most recent bookings\n');
    }
    
    const result = await client.query(query, params);
    
    if (result.rows.length === 0) {
      console.log('❌ No bookings found');
      return;
    }
    
    console.log(`✅ Found ${result.rows.length} booking(s):\n`);
    
    for (const booking of result.rows) {
      console.log(`Booking ID: ${booking.id}`);
      console.log(`Customer: ${booking.customer_name}`);
      console.log(`Email: ${booking.customer_email || 'NOT PROVIDED'}`);
      console.log(`Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
      console.log(`Payment Status: ${booking.payment_status}`);
      console.log(`Zoho Invoice ID: ${booking.zoho_invoice_id || 'NOT CREATED'}`);
      console.log(`Invoice Created At: ${booking.zoho_invoice_created_at || 'N/A'}`);
      console.log(`Total Price: ${booking.total_price} SAR`);
      console.log(`Created At: ${booking.created_at}`);
      console.log('');
      
      // Check email config
      if (booking.customer_email) {
        console.log('📧 Email Configuration Check:');
        console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || 'NOT SET'}`);
        console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || 'NOT SET'}`);
        console.log(`   SMTP_USER: ${process.env.SMTP_USER ? 'SET' : 'NOT SET'}`);
        console.log(`   SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? 'SET' : 'NOT SET'}`);
        console.log('');
      }
      
      // Recommendations
      console.log('💡 Recommendations:');
      if (booking.payment_status !== 'paid') {
        console.log(`   ⚠️  Payment status is '${booking.payment_status}' - Invoice will only be created when payment_status = 'paid'`);
        console.log(`   💡 To create invoice, update payment status to 'paid'`);
      } else if (!booking.zoho_invoice_id) {
        console.log(`   ⚠️  Payment is 'paid' but no invoice created yet`);
        console.log(`   💡 Invoice should be created automatically. Check zoho_invoice_logs table.`);
      } else {
        console.log(`   ✅ Invoice already created: ${booking.zoho_invoice_id}`);
      }
      
      if (!booking.customer_email) {
        console.log(`   ⚠️  No email provided - cannot send ticket or invoice via email`);
      }
      
      console.log('---\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBooking();

