/**
 * Test the complete OAuth flow with current configuration
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

const TENANT_ID = '63107b06-938e-4ce6-b0f3-520a87db397b';

async function testOAuthFlow() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Zoho OAuth Flow Configuration\n');
    console.log('='.repeat(60));

    // Step 1: Check current configuration
    console.log('📋 Step 1: Checking current configuration...\n');
    const configResult = await client.query(
      `SELECT client_id, client_secret, redirect_uri, region, is_active 
       FROM tenant_zoho_configs 
       WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (configResult.rows.length === 0) {
      console.log('❌ No Zoho configuration found for tenant');
      console.log('   Please save your credentials in Settings first\n');
      return;
    }

    const config = configResult.rows[0];
    console.log('✅ Configuration found:');
    console.log(`   Client ID: ${config.client_id.substring(0, 20)}...`);
    console.log(`   Redirect URI: ${config.redirect_uri}`);
    console.log(`   Region: ${config.region || 'com'}`);
    console.log(`   Active: ${config.is_active}\n`);

    // Step 2: Verify redirect URI format
    console.log('🔍 Step 2: Verifying redirect URI...\n');
    const redirectUri = config.redirect_uri || 'http://localhost:3001/api/zoho/callback';
    
    if (redirectUri.includes('localhost:5173')) {
      console.log('❌ ERROR: Redirect URI still uses frontend port (5173)');
      console.log(`   Current: ${redirectUri}`);
      console.log('   Should be: http://localhost:3001/api/zoho/callback');
      console.log('   Please update in Settings → Zoho Integration\n');
      return;
    } else if (redirectUri.includes('localhost:3001')) {
      console.log('✅ Redirect URI correctly points to backend (port 3001)');
      console.log(`   URI: ${redirectUri}\n`);
    } else {
      console.log(`⚠️  Redirect URI: ${redirectUri}`);
      console.log('   Make sure this matches what you configured in Zoho Developer Console\n');
    }

    // Step 3: Generate OAuth URL
    console.log('🔗 Step 3: Generating OAuth authorization URL...\n');
    const scope = [
      'ZohoInvoice.invoices.CREATE',
      'ZohoInvoice.invoices.READ',
      'ZohoInvoice.contacts.CREATE',
      'ZohoInvoice.contacts.READ'
    ].join(',');

    const state = Buffer.from(JSON.stringify({ tenant_id: TENANT_ID })).toString('base64');
    
    // Determine accounts URL based on region
    let accountsUrl = 'https://accounts.zoho.com/oauth/v2/auth';
    const region = config.region || 'com';
    if (region === 'eu') {
      accountsUrl = 'https://accounts.zoho.eu/oauth/v2/auth';
    } else if (region === 'in') {
      accountsUrl = 'https://accounts.zoho.in/oauth/v2/auth';
    } else if (region === 'au') {
      accountsUrl = 'https://accounts.zoho.com.au/oauth/v2/auth';
    } else if (region === 'jp') {
      accountsUrl = 'https://accounts.zoho.jp/oauth/v2/auth';
    }

    const authUrl = `${accountsUrl}?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${config.client_id}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    console.log('✅ OAuth URL generated successfully\n');
    console.log('📋 Authorization URL:');
    console.log(authUrl);
    console.log('\n');

    // Step 4: Check existing tokens
    console.log('🔑 Step 4: Checking existing tokens...\n');
    const tokenResult = await client.query(
      `SELECT access_token, refresh_token, expires_at 
       FROM zoho_tokens 
       WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (tokenResult.rows.length > 0) {
      const token = tokenResult.rows[0];
      const expiresAt = new Date(token.expires_at);
      const now = new Date();
      const isExpired = expiresAt <= now;
      const timeUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / 1000 / 60);

      console.log('✅ Tokens found:');
      console.log(`   Access Token: ${token.access_token.substring(0, 20)}...`);
      console.log(`   Refresh Token: ${token.refresh_token.substring(0, 20)}...`);
      console.log(`   Expires at: ${expiresAt.toLocaleString()}`);
      
      if (isExpired) {
        console.log(`   Status: ❌ EXPIRED`);
        console.log('   You need to re-authorize or refresh the token\n');
      } else {
        console.log(`   Status: ✅ Valid (expires in ${timeUntilExpiry} minutes)`);
        console.log('   You can use the existing tokens\n');
      }
    } else {
      console.log('⚠️  No tokens found');
      console.log('   You need to complete the OAuth flow\n');
    }

    // Step 5: Verification checklist
    console.log('✅ Step 5: Verification Checklist\n');
    console.log('Before testing OAuth, verify:');
    console.log(`   [${redirectUri.includes('3001') ? '✓' : '✗'}] Redirect URI uses port 3001 (backend)`);
    console.log(`   [${config.is_active ? '✓' : '✗'}] Configuration is active`);
    console.log(`   [${config.client_id ? '✓' : '✗'}] Client ID is set`);
    console.log(`   [${config.client_secret ? '✓' : '✗'}] Client Secret is set`);
    console.log(`   [${redirectUri ? '✓' : '✗'}] Redirect URI is set`);
    console.log('\n');

    // Step 6: Instructions
    console.log('📝 Step 6: Next Steps\n');
    console.log('1. Verify the redirect URI in Zoho Developer Console:');
    console.log(`   - Should be exactly: ${redirectUri}`);
    console.log('   - No trailing slash');
    console.log('   - No extra spaces\n');
    console.log('2. Open the OAuth URL above in your browser');
    console.log('3. Sign in to Zoho and authorize the application');
    console.log('4. You will be redirected to the callback URL');
    console.log('5. Tokens will be automatically saved\n');
    console.log('OR use the Settings page:');
    console.log('   - Go to Settings → Zoho Invoice Integration');
    console.log('   - Click "Connect to Zoho" button');
    console.log('   - Complete the authorization\n');

    console.log('✅ Configuration test complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testOAuthFlow().catch(console.error);

