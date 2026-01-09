/**
 * Exchange Zoho authorization code for tokens using tenant-specific credentials
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
const authorizationCode = process.argv[2];

if (!authorizationCode) {
  console.log('Usage: node exchange-code-tenant.js <authorization_code>');
  console.log('Example: node exchange-code-tenant.js 1000.abc123...');
  process.exit(1);
}

async function exchangeCode() {
  const client = await pool.connect();
  try {
    console.log('🔄 Exchanging authorization code for tokens...\n');

    // Get tenant credentials
    const configResult = await client.query(
      `SELECT client_id, client_secret, redirect_uri, region 
       FROM tenant_zoho_configs 
       WHERE tenant_id = $1 AND is_active = true`,
      [TENANT_ID]
    );

    if (configResult.rows.length === 0) {
      throw new Error('Zoho configuration not found for tenant. Please save credentials first.');
    }

    const config = configResult.rows[0];
    console.log(`Client ID: ${config.client_id.substring(0, 15)}...`);
    console.log(`Redirect URI: ${config.redirect_uri}`);
    console.log(`Region: ${config.region}\n`);

    // Determine token endpoint based on region
    let tokenEndpoint = 'https://accounts.zoho.com/oauth/v2/token';
    if (config.region === 'eu') {
      tokenEndpoint = 'https://accounts.zoho.eu/oauth/v2/token';
    } else if (config.region === 'in') {
      tokenEndpoint = 'https://accounts.zoho.in/oauth/v2/token';
    } else if (config.region === 'au') {
      tokenEndpoint = 'https://accounts.zoho.com.au/oauth/v2/token';
    } else if (config.region === 'jp') {
      tokenEndpoint = 'https://accounts.zoho.jp/oauth/v2/token';
    }

    console.log(`Token endpoint: ${tokenEndpoint}\n`);

    // Exchange code for tokens
    console.log('📤 Sending token exchange request...');
    const tokenResponse = await axios.post(
      tokenEndpoint,
      null,
      {
        params: {
          grant_type: 'authorization_code',
          client_id: config.client_id,
          client_secret: config.client_secret,
          redirect_uri: config.redirect_uri,
          code: authorizationCode,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token || !refresh_token) {
      throw new Error('Failed to obtain tokens from Zoho');
    }

    console.log('✅ Tokens received successfully!');
    console.log(`   Access Token: ${access_token.substring(0, 20)}...`);
    console.log(`   Refresh Token: ${refresh_token.substring(0, 20)}...`);
    console.log(`   Expires in: ${expires_in} seconds\n`);

    // Store tokens in database
    console.log('💾 Storing tokens in database...');
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await client.query(
      `INSERT INTO zoho_tokens (tenant_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [TENANT_ID, access_token, refresh_token, expiresAt]
    );

    console.log('✅ Tokens stored successfully!');
    console.log(`   Expires at: ${expiresAt.toLocaleString()}\n`);

    // Test token by making a simple API call
    console.log('🧪 Testing token with Zoho API...');
    try {
      const apiBaseUrl = config.region === 'eu' 
        ? 'https://invoice.zoho.eu/api/v3'
        : config.region === 'in'
        ? 'https://invoice.zoho.in/api/v3'
        : 'https://invoice.zoho.com/api/v3';

      const testResponse = await axios.get(`${apiBaseUrl}/contacts`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${access_token}`,
        },
        params: {
          page: 1,
          per_page: 1,
        },
      });

      console.log('✅ Token is valid! API connection successful.');
      console.log(`   API Base URL: ${apiBaseUrl}`);
      console.log(`   Contacts found: ${testResponse.data?.contacts?.length || 0}\n`);
    } catch (apiError: any) {
      console.log('⚠️  Token received but API test failed:');
      console.log(`   ${apiError.response?.data?.message || apiError.message}`);
      console.log('   This might be normal if you need to set up your Zoho organization first.\n');
    }

    console.log('✅ OAuth setup complete!');
    console.log('   You can now use Zoho Invoice features in the application.\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
      console.error('   Status:', error.response.status);
    }
    if (error.code === 'invalid_code') {
      console.error('\n   The authorization code may have expired or already been used.');
      console.error('   Get a new code by running the OAuth flow again.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

exchangeCode().catch(console.error);

