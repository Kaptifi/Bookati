/**
 * Check if Zoho tokens exist and are valid
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

const TENANT_ID = '63107b06-938e-4ce6-b0f3-520a87db397b';

async function checkTokens() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Zoho Tokens\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${TENANT_ID}\n`);

    // Check tokens
    const tokenResult = await client.query(
      `SELECT access_token, refresh_token, expires_at, created_at, updated_at 
       FROM zoho_tokens 
       WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (tokenResult.rows.length === 0) {
      console.log('❌ NO ZOHO TOKENS FOUND');
      console.log('\nThis means:');
      console.log('   - Zoho is NOT connected');
      console.log('   - Invoice creation will FAIL');
      console.log('   - Error will be caught silently');
      console.log('   - Tickets will still work (they don\'t need Zoho)\n');
      console.log('To fix: Connect to Zoho in Settings → Zoho Invoice Integration\n');
      return;
    }

    const token = tokenResult.rows[0];
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;
    const timeUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / 1000 / 60);

    console.log('✅ ZOHO TOKENS FOUND\n');
    console.log('Token Details:');
    console.log(`   Access Token: ${token.access_token.substring(0, 20)}...`);
    console.log(`   Refresh Token: ${token.refresh_token.substring(0, 20)}...`);
    console.log(`   Created: ${new Date(token.created_at).toLocaleString()}`);
    console.log(`   Updated: ${new Date(token.updated_at).toLocaleString()}`);
    console.log(`   Expires: ${expiresAt.toLocaleString()}`);
    console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ VALID'}`);
    
    if (!isExpired) {
      console.log(`   Time until expiry: ${timeUntilExpiry} minutes\n`);
      console.log('✅ This means invoices SHOULD work!');
      console.log('   - Tokens are valid');
      console.log('   - Invoice creation should succeed');
      console.log('   - If invoices are not being created, check server logs\n');
    } else {
      console.log('\n⚠️  Tokens are EXPIRED');
      console.log('   - Invoice creation will FAIL');
      console.log('   - Need to refresh tokens or re-connect Zoho\n');
    }

    // Check recent bookings
    console.log('📋 Checking Recent Bookings:\n');
    const bookingsResult = await client.query(
      `SELECT id, customer_name, zoho_invoice_id, zoho_invoice_created_at, created_at
       FROM bookings 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [TENANT_ID]
    );

    if (bookingsResult.rows.length > 0) {
      console.log('Recent bookings:');
      bookingsResult.rows.forEach((booking, index) => {
        console.log(`\n   ${index + 1}. Booking: ${booking.id.substring(0, 8)}...`);
        console.log(`      Customer: ${booking.customer_name}`);
        console.log(`      Created: ${new Date(booking.created_at).toLocaleString()}`);
        console.log(`      Invoice ID: ${booking.zoho_invoice_id || '❌ NOT CREATED'}`);
        if (booking.zoho_invoice_created_at) {
          console.log(`      Invoice Created: ${new Date(booking.zoho_invoice_created_at).toLocaleString()}`);
        }
      });
      console.log('\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTokens().catch(console.error);

