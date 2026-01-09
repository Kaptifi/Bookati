/**
 * Test Zoho API connection with current tokens
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

async function testConnection() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Zoho API Connection\n');
    console.log('='.repeat(60));

    // Get configuration
    const configResult = await client.query(
      `SELECT client_id, redirect_uri, region FROM tenant_zoho_configs WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (configResult.rows.length === 0) {
      console.log('❌ No Zoho configuration found');
      return;
    }

    const config = configResult.rows[0];
    console.log('📋 Configuration:');
    console.log(`   Client ID: ${config.client_id.substring(0, 20)}...`);
    console.log(`   Redirect URI: ${config.redirect_uri}`);
    console.log(`   Region: ${config.region || 'com'}\n`);

    // Get tokens
    const tokenResult = await client.query(
      `SELECT access_token, refresh_token, expires_at FROM zoho_tokens WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (tokenResult.rows.length === 0) {
      console.log('⚠️  No tokens found. You need to complete OAuth flow first.');
      console.log('   Use Settings page → "Connect to Zoho" or run OAuth flow\n');
      return;
    }

    const token = tokenResult.rows[0];
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    console.log('🔑 Tokens:');
    console.log(`   Access Token: ${token.access_token.substring(0, 20)}...`);
    console.log(`   Expires at: ${expiresAt.toLocaleString()}`);
    console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ Valid'}\n`);

    if (isExpired) {
      console.log('⚠️  Token is expired. You need to refresh or re-authorize.\n');
      return;
    }

    // Test API connection
    console.log('🌐 Testing Zoho Invoice API connection...\n');
    const region = config.region || 'com';
    let apiBaseUrl = 'https://invoice.zoho.com/api/v3';
    if (region === 'eu') {
      apiBaseUrl = 'https://invoice.zoho.eu/api/v3';
    } else if (region === 'in') {
      apiBaseUrl = 'https://invoice.zoho.in/api/v3';
    } else if (region === 'au') {
      apiBaseUrl = 'https://invoice.zoho.com.au/api/v3';
    } else if (region === 'jp') {
      apiBaseUrl = 'https://invoice.zoho.jp/api/v3';
    }

    console.log(`   API Base URL: ${apiBaseUrl}\n`);

    try {
      // Test 1: List contacts
      console.log('📋 Test 1: Listing contacts...');
      const contactsResponse = await axios.get(`${apiBaseUrl}/contacts`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token.access_token}`,
        },
        params: {
          page: 1,
          per_page: 5,
        },
      });

      console.log('✅ Contacts API: SUCCESS');
      console.log(`   Found ${contactsResponse.data?.contacts?.length || 0} contacts\n`);

      // Test 2: Check organization
      console.log('🏢 Test 2: Checking organization...');
      const orgResponse = await axios.get(`${apiBaseUrl}/organizations`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token.access_token}`,
        },
      });

      if (orgResponse.data?.organizations && orgResponse.data.organizations.length > 0) {
        const org = orgResponse.data.organizations[0];
        console.log('✅ Organization API: SUCCESS');
        console.log(`   Organization: ${org.organization_name || 'N/A'}`);
        console.log(`   Organization ID: ${org.organization_id || 'N/A'}\n`);
      } else {
        console.log('⚠️  Organization API: No organizations found');
        console.log('   You may need to create an organization in Zoho Invoice\n');
      }

      console.log('✅ All API tests passed!');
      console.log('   Zoho integration is working correctly\n');

    } catch (apiError) {
      console.log('❌ API test failed:');
      if (apiError.response) {
        console.log(`   Status: ${apiError.response.status}`);
        console.log(`   Error: ${JSON.stringify(apiError.response.data, null, 2)}`);
        
        if (apiError.response.status === 401) {
          console.log('\n   ⚠️  Token may be invalid or expired');
          console.log('   Try refreshing the token or re-authorizing\n');
        } else if (apiError.response.status === 403) {
          console.log('\n   ⚠️  Access denied. Check your Zoho permissions');
        }
      } else {
        console.log(`   Error: ${apiError.message}`);
      }
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   [${config.redirect_uri.includes('3001') ? '✓' : '✗'}] Redirect URI configured correctly`);
    console.log(`   [${!isExpired ? '✓' : '✗'}] Tokens are valid`);
    console.log(`   [${config.is_active ? '✓' : '✗'}] Configuration is active`);
    console.log('\n✅ Configuration review complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testConnection().catch(console.error);

