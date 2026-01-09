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

const customerEmail = process.argv[2] || 'kaptifidev@gmail.com';

async function testCustomerInvoices() {
  const client = await pool.connect();
  try {
    console.log('🔍 Testing Customer Invoices\n');
    console.log('='.repeat(60));
    console.log(`Customer Email: ${customerEmail}\n`);

    // Find customer by email
    const userResult = await client.query(
      `SELECT id, email, role FROM users WHERE email = $1 OR email = $2`,
      [customerEmail, `${customerEmail.split('@')[0]}@bookati.local`]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Customer not found');
      console.log('\n💡 Try with a different email or check if the customer exists');
      return;
    }

    const customer = userResult.rows[0];
    console.log(`✅ Customer found:`);
    console.log(`   ID: ${customer.id}`);
    console.log(`   Email: ${customer.email}`);
    console.log(`   Role: ${customer.role}`);
    console.log('');

    // Check bookings with invoices
    const invoicesResult = await client.query(
      `SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.total_price,
        b.status,
        b.payment_status,
        b.created_at,
        s.name as service_name,
        sl.slot_date
      FROM bookings b
      INNER JOIN services s ON b.service_id = s.id
      INNER JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
      ORDER BY b.zoho_invoice_created_at DESC, b.created_at DESC`,
      [customer.id]
    );

    console.log(`📋 Invoices found: ${invoicesResult.rows.length}\n`);

    if (invoicesResult.rows.length === 0) {
      // Check if customer has any bookings at all
      const allBookingsResult = await client.query(
        `SELECT COUNT(*) as total, 
         COUNT(CASE WHEN zoho_invoice_id IS NOT NULL THEN 1 END) as with_invoice
         FROM bookings WHERE customer_id = $1`,
        [customer.id]
      );

      const stats = allBookingsResult.rows[0];
      console.log(`📊 Booking Statistics:`);
      console.log(`   Total bookings: ${stats.total}`);
      console.log(`   Bookings with invoices: ${stats.with_invoice}`);
      console.log('');

      if (parseInt(stats.total) === 0) {
        console.log('⚠️  Customer has no bookings at all');
        console.log('   Invoices are created automatically when bookings are made');
      } else if (parseInt(stats.with_invoice) === 0) {
        console.log('⚠️  Customer has bookings but no invoices');
        console.log('   This could mean:');
        console.log('   1. Invoices haven\'t been created yet (check server logs)');
        console.log('   2. Bookings were made before invoice integration');
        console.log('   3. Invoice creation failed (check zoho_invoice_logs table)');
      }
    } else {
      console.log('✅ Invoices:');
      invoicesResult.rows.forEach((invoice, idx) => {
        console.log(`\n   ${idx + 1}. Invoice ID: ${invoice.zoho_invoice_id}`);
        console.log(`      Service: ${invoice.service_name}`);
        console.log(`      Date: ${invoice.slot_date || 'N/A'}`);
        console.log(`      Price: ${invoice.total_price} SAR`);
        console.log(`      Status: ${invoice.status}`);
        console.log(`      Payment: ${invoice.payment_status}`);
        console.log(`      Created: ${invoice.zoho_invoice_created_at || invoice.created_at}`);
      });
    }

    // Check if there are bookings without customer_id (guest bookings)
    const guestBookingsResult = await client.query(
      `SELECT COUNT(*) as count
       FROM bookings 
       WHERE (customer_email = $1 OR customer_phone LIKE $2)
         AND customer_id IS NULL
         AND zoho_invoice_id IS NOT NULL`,
      [customerEmail, `%${customerEmail.split('@')[0]}%`]
    );

    const guestCount = parseInt(guestBookingsResult.rows[0].count);
    if (guestCount > 0) {
      console.log(`\n⚠️  Found ${guestCount} guest bookings (no customer_id) with invoices`);
      console.log('   These won\'t show up in the billing page because they\'re not linked to the customer account');
      console.log('   Solution: Link guest bookings to customer account by matching email/phone');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testCustomerInvoices();

