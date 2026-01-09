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

const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';

async function checkZohoRegion() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Zoho Region Configuration\n');
    console.log('='.repeat(60));

    // Get tokens from database
    const tokenResult = await client.query(
      `SELECT access_token, refresh_token, expires_at FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tokenResult.rows.length === 0) {
      console.log('❌ No tokens found in database');
      console.log('   Please run: node scripts/exchange-code-for-tokens.js');
      return;
    }

    const { access_token, expires_at } = tokenResult.rows[0];
    const expiresAt = new Date(expires_at);
    const now = new Date();

    console.log(`✅ Tokens found`);
    console.log(`   Token expires at: ${expiresAt.toLocaleString()}`);
    console.log(`   Current time: ${now.toLocaleString()}`);
    console.log(`   Token valid: ${expiresAt > now ? 'YES' : 'NO'}`);
    console.log('');

    // Test different API regions
    const regions = [
      { name: 'US', url: 'https://invoice.zoho.com/api/v3' },
      { name: 'EU', url: 'https://invoice.zoho.eu/api/v3' },
      { name: 'India', url: 'https://invoice.zoho.in/api/v3' },
      { name: 'Australia', url: 'https://invoice.zoho.com.au/api/v3' },
    ];

    console.log('🧪 Testing API regions with current token...\n');

    for (const region of regions) {
      try {
        console.log(`Testing ${region.name} region (${region.url})...`);
        const response = await axios.get(
          `${region.url}/invoices`,
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${access_token}`,
              'Content-Type': 'application/json',
            },
            params: {
              page: 1,
              per_page: 1,
            },
          }
        );

        console.log(`   ✅ SUCCESS! Your organization is in the ${region.name} region`);
        console.log(`   ✅ Use this API Base URL: ${region.url}`);
        console.log(`   ✅ Add to your .env file: ZOHO_API_BASE_URL=${region.url}`);
        console.log('');
        console.log('💡 Next steps:');
        console.log('   1. Add ZOHO_API_BASE_URL to your server/.env file');
        console.log('   2. Restart your server');
        console.log('   3. Re-authenticate Zoho using the OAuth flow');
        console.log('   4. Test invoice delivery again');
        return;
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          const errorData = error.response.data;
          if (status === 401) {
            console.log(`   ❌ 401 Unauthorized (token not valid for this region)`);
          } else if (status === 403) {
            console.log(`   ❌ 403 Forbidden (permission issue)`);
          } else {
            console.log(`   ❌ ${status} ${errorData?.message || 'Error'}`);
          }
        } else {
          console.log(`   ❌ Network error: ${error.message}`);
        }
      }
    }

    console.log('\n⚠️  Could not determine region automatically');
    console.log('   Please check your Zoho Invoice URL:');
    console.log('   1. Log in to https://invoice.zoho.com/');
    console.log('   2. Check the URL in your browser');
    console.log('   3. If it contains .zoho.eu → Use EU region');
    console.log('   4. If it contains .zoho.in → Use India region');
    console.log('   5. If it contains .zoho.com (not .eu/.in) → Use US region');
    console.log('   6. Set ZOHO_API_BASE_URL in your .env file accordingly');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkZohoRegion();

