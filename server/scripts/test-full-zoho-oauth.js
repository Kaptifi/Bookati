/**
 * Complete Zoho OAuth test - from configuration to token exchange
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

// User-provided credentials
const TENANT_ID = '63107b06-938e-4ce6-b0f3-520a87db397b';
const CLIENT_ID = '1000.UUD4C6OWU3NYRL9SJDPDIUGVS2E7ME';
const CLIENT_SECRET = '1000.UUD4C6OWU3NYRL9SJDPDIUGVS2E7ME'; // Verify this is correct
const REDIRECT_URI = 'http://localhost:3001/api/zoho/callback'; // Backend port
const REGION = 'com';

async function testFullOAuth() {
  const client = await pool.connect();
  try {
    console.log('🧪 Complete Zoho OAuth Test\n');
    console.log('='.repeat(60));

    // Step 1: Update configuration
    console.log('📝 Step 1: Updating Zoho configuration...');
    await client.query(
      `INSERT INTO tenant_zoho_configs 
       (tenant_id, client_id, client_secret, redirect_uri, region, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (tenant_id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         redirect_uri = EXCLUDED.redirect_uri,
         region = EXCLUDED.region,
         is_active = true,
         updated_at = NOW()`,
      [TENANT_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REGION]
    );
    console.log('✅ Configuration saved\n');

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

    console.log('✅ OAuth URL generated\n');
    console.log('📋 CRITICAL: Update Zoho Developer Console first!\n');
    console.log('   1. Go to: https://api-console.zoho.com/');
    console.log(`   2. Find application with Client ID: ${CLIENT_ID.substring(0, 15)}...`);
    console.log('   3. Click "Edit" or "Settings"');
    console.log('   4. In "Authorized Redirect URIs", REMOVE: http://localhost:5173/api/zoho/callback');
    console.log(`   5. ADD this EXACT URI: ${REDIRECT_URI}`);
    console.log('   6. Make sure NO trailing slash');
    console.log('   7. Click "Save" or "Update"');
    console.log('   8. Wait 30 seconds for changes to propagate\n');
    console.log('📋 Then open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n');

    // Step 3: Instructions for manual testing
    console.log('📝 Step 3: After authorization...');
    console.log('   - You will be redirected to: ' + REDIRECT_URI + '?code=...');
    console.log('   - Copy the "code" parameter from the URL');
    console.log('   - Run: node scripts/exchange-code-for-tokens.js <code>\n');

    // Step 4: Verify configuration
    console.log('🔍 Step 4: Configuration Summary\n');
    const configResult = await client.query(
      `SELECT client_id, redirect_uri, region FROM tenant_zoho_configs WHERE tenant_id = $1`,
      [TENANT_ID]
    );
    
    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      console.log(`   Client ID: ${config.client_id.substring(0, 15)}...`);
      console.log(`   Redirect URI: ${config.redirect_uri}`);
      console.log(`   Region: ${config.region}`);
      console.log(`\n   ✅ Configuration is ready for OAuth flow\n`);
    }

    // Step 5: Warnings
    console.log('⚠️  WARNINGS:\n');
    if (CLIENT_SECRET === CLIENT_ID) {
      console.log('   ⚠️  Client Secret appears identical to Client ID');
      console.log('      Please verify the Client Secret in Zoho Developer Console');
      console.log('      This is unusual and may cause authentication failures\n');
    }
    
    if (REDIRECT_URI.includes('5173')) {
      console.log('   ⚠️  Redirect URI uses port 5173 (frontend)');
      console.log('      Backend runs on port 3001');
      console.log('      Update Zoho Developer Console to use port 3001\n');
    }

    console.log('✅ Test setup complete!');
    console.log('\n📋 Next: Update Zoho Developer Console, then open the OAuth URL above');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testFullOAuth().catch(console.error);

