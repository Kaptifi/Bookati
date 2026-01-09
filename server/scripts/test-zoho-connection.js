/**
 * Test Zoho OAuth connection with provided credentials
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

// Credentials from user
const TENANT_ID = '63107b06-938e-4ce6-b0f3-520a87db397b';
const CLIENT_ID = '1000.UUD4C6OWU3NYRL9SJDPDIUGVS2E7ME';
const CLIENT_SECRET = '1000.UUD4C6OWU3NYRL9SJDPDIUGVS2E7ME'; // Note: This looks like it might be the same as Client ID - verify in Zoho
const REDIRECT_URI = 'http://localhost:3001/api/zoho/callback'; // Backend runs on 3001, not 5173
const REGION = 'com'; // Default to com, user provided a hash which might be region-specific

async function testConnection() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Zoho OAuth Connection\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${TENANT_ID}`);
    console.log(`Client ID: ${CLIENT_ID}`);
    console.log(`Redirect URI: ${REDIRECT_URI}`);
    console.log(`Region: ${REGION}\n`);

    // Step 1: Update or insert Zoho config
    console.log('📝 Step 1: Updating Zoho configuration in database...');
    const updateResult = await client.query(
      `INSERT INTO tenant_zoho_configs 
       (tenant_id, client_id, client_secret, redirect_uri, region, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (tenant_id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         redirect_uri = EXCLUDED.redirect_uri,
         region = EXCLUDED.region,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [TENANT_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REGION]
    );

    if (updateResult.rows.length > 0) {
      console.log('✅ Zoho configuration saved successfully');
      console.log(`   Redirect URI: ${updateResult.rows[0].redirect_uri}`);
      console.log(`   Region: ${updateResult.rows[0].region}\n`);
    } else {
      throw new Error('Failed to save Zoho configuration');
    }

    // Step 2: Generate OAuth URL
    console.log('🔗 Step 2: Generating OAuth authorization URL...');
    const scope = [
      'ZohoInvoice.invoices.CREATE',
      'ZohoInvoice.invoices.READ',
      'ZohoInvoice.contacts.CREATE',
      'ZohoInvoice.contacts.READ'
    ].join(',');

    const state = Buffer.from(JSON.stringify({ tenant_id: TENANT_ID })).toString('base64');
    const accountsUrl = 'https://accounts.zoho.com/oauth/v2/auth';
    
    const authUrl = `${accountsUrl}?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `state=${state}`;

    console.log('✅ OAuth URL generated');
    console.log(`\n📋 Authorization URL:`);
    console.log(authUrl);
    console.log(`\n⚠️  IMPORTANT: Make sure this redirect URI is in Zoho Developer Console:`);
    console.log(`   ${REDIRECT_URI}`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Verify the redirect URI "${REDIRECT_URI}" is in Zoho Developer Console`);
    console.log(`   2. Open the URL above in your browser`);
    console.log(`   3. Authorize the application`);
    console.log(`   4. You'll be redirected to: ${REDIRECT_URI}?code=...`);
    console.log(`   5. Copy the authorization code from the URL`);
    console.log(`   6. Run: node scripts/exchange-code-for-tokens.js <code>`);

    // Step 3: Verify redirect URI format
    console.log(`\n🔍 Step 3: Verifying redirect URI format...`);
    if (REDIRECT_URI.includes('localhost:5173')) {
      console.log('⚠️  WARNING: Redirect URI uses port 5173 (frontend), but backend runs on 3001');
      console.log('   The redirect URI should point to the backend API, not the frontend');
      console.log('   Current: http://localhost:5173/api/zoho/callback');
      console.log('   Should be: http://localhost:3001/api/zoho/callback');
      console.log('   Update this in Zoho Developer Console!');
    } else if (REDIRECT_URI.includes('localhost:3001')) {
      console.log('✅ Redirect URI correctly points to backend (port 3001)');
    }

    // Step 4: Check if Client Secret looks suspicious
    if (CLIENT_SECRET === CLIENT_ID) {
      console.log(`\n⚠️  WARNING: Client Secret appears to be the same as Client ID`);
      console.log('   This is unusual. Please verify the Client Secret in Zoho Developer Console');
    }

    console.log('\n✅ Configuration test complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testConnection().catch(console.error);

