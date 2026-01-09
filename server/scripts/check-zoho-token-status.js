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

const tenantId = process.argv[2];

if (!tenantId) {
  console.log('Usage: node check-zoho-token-status.js <tenant_id>');
  console.log('Example: node check-zoho-token-status.js 63107b06-938e-4ce6-b0f3-520a87db397b');
  process.exit(1);
}

async function checkTokenStatus() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Zoho Token Status\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${tenantId}\n`);

    // Get token from database
    const tokenResult = await client.query(
      `SELECT 
        tenant_id,
        access_token,
        refresh_token,
        expires_at,
        created_at,
        updated_at
      FROM zoho_tokens
      WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tokenResult.rows.length === 0) {
      console.log('❌ No Zoho token found for this tenant');
      console.log('\n📋 To authenticate Zoho:');
      console.log(`   1. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log('   2. Complete the OAuth flow');
      console.log('   3. Tokens will be stored automatically');
      return;
    }

    const token = tokenResult.rows[0];
    const now = new Date();
    const expiresAt = new Date(token.expires_at);
    const isExpired = expiresAt < now;
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);

    console.log('📊 Token Status:');
    console.log(`   Access Token: ${token.access_token ? token.access_token.substring(0, 20) + '...' : 'MISSING'}`);
    console.log(`   Refresh Token: ${token.refresh_token ? token.refresh_token.substring(0, 20) + '...' : 'MISSING'}`);
    console.log(`   Expires At: ${expiresAt.toISOString()}`);
    console.log(`   Current Time: ${now.toISOString()}`);
    console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ VALID'}`);
    console.log(`   Time Until Expiry: ${isExpired ? 'Already expired' : `${minutesUntilExpiry} minutes`}`);
    console.log(`   Created At: ${new Date(token.created_at).toISOString()}`);
    console.log(`   Updated At: ${new Date(token.updated_at).toISOString()}`);
    console.log('');

    if (isExpired) {
      console.log('⚠️  Token is expired!');
      console.log('\n📋 To re-authenticate Zoho:');
      console.log(`   1. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log('   2. Complete the OAuth flow');
      console.log('   3. New tokens will be stored automatically');
    } else if (!token.refresh_token) {
      console.log('⚠️  No refresh token available!');
      console.log('\n📋 To authenticate Zoho:');
      console.log(`   1. Visit: http://localhost:3001/api/zoho/auth?tenant_id=${tenantId}`);
      console.log('   2. Complete the OAuth flow');
      console.log('   3. Tokens will be stored automatically');
    } else {
      console.log('✅ Token is valid');
      console.log('   The system will automatically refresh the token when it expires');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTokenStatus();

