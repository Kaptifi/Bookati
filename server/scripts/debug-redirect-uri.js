/**
 * Debug script to show EXACT redirect URI being sent to Zoho
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

async function debugRedirectUri() {
  const client = await pool.connect();
  try {
    console.log('🔍 Debugging Redirect URI\n');
    console.log('='.repeat(60));

    // Get configuration
    const configResult = await client.query(
      `SELECT client_id, redirect_uri, region FROM tenant_zoho_configs WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (configResult.rows.length === 0) {
      console.log('❌ No configuration found');
      return;
    }

    const config = configResult.rows[0];
    const redirectUri = config.redirect_uri || 'http://localhost:3001/api/zoho/callback';

    console.log('📋 Configuration from Database:');
    console.log(`   Raw value: "${redirectUri}"`);
    console.log(`   Length: ${redirectUri.length} characters`);
    console.log(`   Has trailing slash: ${redirectUri.endsWith('/') ? 'YES ❌' : 'NO ✅'}`);
    console.log(`   Has leading space: ${redirectUri.startsWith(' ') ? 'YES ❌' : 'NO ✅'}`);
    console.log(`   Has trailing space: ${redirectUri.endsWith(' ') ? 'YES ❌' : 'NO ✅'}`);
    console.log(`   Character codes: ${Array.from(redirectUri).map(c => c.charCodeAt(0)).join(', ')}\n`);

    // Show what will be sent to Zoho
    const encodedUri = encodeURIComponent(redirectUri);
    console.log('🔗 What will be sent to Zoho:');
    console.log(`   Original: ${redirectUri}`);
    console.log(`   URL Encoded: ${encodedUri}`);
    console.log(`   In OAuth URL: redirect_uri=${encodedUri}\n`);

    // Generate full OAuth URL
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
      `client_id=${config.client_id}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    console.log('📋 Full OAuth URL:');
    console.log(authUrl);
    console.log('\n');

    // Extract redirect_uri from URL to verify
    const urlObj = new URL(authUrl);
    const redirectParam = urlObj.searchParams.get('redirect_uri');
    console.log('🔍 Verification - Redirect URI from OAuth URL:');
    console.log(`   Decoded: ${decodeURIComponent(redirectParam)}`);
    console.log(`   Matches config: ${decodeURIComponent(redirectParam) === redirectUri ? '✅ YES' : '❌ NO'}\n`);

    // Instructions
    console.log('📝 CRITICAL: What to check in Zoho Developer Console:\n');
    console.log('1. Go to: https://api-console.zoho.com/');
    console.log(`2. Find application with Client ID: ${config.client_id.substring(0, 20)}...`);
    console.log('3. Click "Edit" or "Settings"');
    console.log('4. In "Authorized Redirect URIs", you MUST have EXACTLY:\n');
    console.log(`   ${redirectUri}\n`);
    console.log('5. Check for these common mistakes:');
    console.log(`   ❌ ${redirectUri}/ (with trailing slash)`);
    console.log(`   ❌ ${redirectUri}  (with trailing space)`);
    console.log(`   ❌  ${redirectUri} (with leading space)`);
    console.log(`   ❌ http://localhost:5173/api/zoho/callback (wrong port)`);
    console.log(`   ❌ https://localhost:3001/api/zoho/callback (https instead of http)`);
    console.log(`   ✅ ${redirectUri} (correct)\n`);

    // Check if there are multiple URIs
    console.log('⚠️  IMPORTANT:');
    console.log('   - Remove ALL other redirect URIs (especially the 5173 one)');
    console.log('   - Keep ONLY the one shown above');
    console.log('   - Wait 30-60 seconds after saving');
    console.log('   - Try again\n');

    // Show exact bytes
    console.log('🔬 Character-by-character breakdown:');
    for (let i = 0; i < redirectUri.length; i++) {
      const char = redirectUri[i];
      const code = char.charCodeAt(0);
      console.log(`   [${i}] '${char}' (code: ${code})`);
    }
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

debugRedirectUri().catch(console.error);

