/**
 * Zoho Self Client Token Exchange Script
 * 
 * This script reads the authorization code from self_client.json and exchanges it
 * for access_token and refresh_token using Zoho's OAuth 2.0 token endpoint.
 * 
 * Security:
 * - All credentials are read from backend files only
 * - Tokens are stored securely in the database
 * - No secrets are exposed to frontend
 * - Refresh tokens are stored for long-term use
 */

import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

// Tenant ID for storing tokens (you can modify this)
const TENANT_ID = process.env.ZOHO_TENANT_ID || '63107b06-938e-4ce6-b0f3-520a87db397b';

/**
 * Step 1: Read and parse self_client.json securely
 * 
 * This function reads the JSON file from the server directory and extracts
 * the OAuth credentials. The file should never be exposed to the frontend.
 */
function readSelfClientJson() {
  const selfClientPath = join(__dirname, '..', 'self_client.json');
  
  try {
    console.log('📄 Step 1: Reading self_client.json...');
    const fileContent = readFileSync(selfClientPath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // Validate required fields
    if (!jsonData.client_id) {
      throw new Error('client_id is missing in self_client.json');
    }
    if (!jsonData.client_secret) {
      throw new Error('client_secret is missing in self_client.json');
    }
    if (!jsonData.code) {
      throw new Error('code (authorization code) is missing in self_client.json');
    }
    
    console.log('✅ Successfully loaded credentials from self_client.json');
    console.log(`   Client ID: ${jsonData.client_id.substring(0, 15)}...`);
    console.log(`   Code present: ${jsonData.code ? 'Yes' : 'No'}`);
    console.log(`   Scope: ${jsonData.scope?.join(', ') || 'Not specified'}`);
    
    return {
      client_id: jsonData.client_id,
      client_secret: jsonData.client_secret,
      code: jsonData.code,
      scope: jsonData.scope || ['ZohoInvoice.invoices.CREATE', 'ZohoInvoice.invoices.READ', 'ZohoInvoice.invoices.UPDATE'],
      grant_type: jsonData.grant_type || 'authorization_code',
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`self_client.json not found at: ${selfClientPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in self_client.json: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Step 2: Exchange authorization code for tokens
 * 
 * Makes a POST request to Zoho's OAuth token endpoint to exchange the
 * one-time authorization code for access_token and refresh_token.
 * 
 * Note: The authorization code can only be used once. After successful
 * exchange, you should use the refresh_token for future requests.
 */
async function exchangeCodeForTokens(credentials) {
  console.log('\n🔄 Step 2: Exchanging authorization code for tokens...');
  
  try {
    // Zoho OAuth 2.0 token endpoint
    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    
    // For Self Client flow, redirect_uri may be required depending on Zoho region
    // Try without redirect_uri first, then with it if that fails
    const redirectUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
    
    // Prepare request parameters (try without redirect_uri first)
    let params = {
      grant_type: 'authorization_code',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      code: credentials.code,
    };
    
    console.log('   Making POST request to Zoho token endpoint...');
    console.log(`   URL: ${tokenUrl}`);
    console.log(`   Grant type: ${params.grant_type}`);
    console.log(`   Client ID: ${params.client_id.substring(0, 15)}...`);
    
    // Make POST request to Zoho
    // Try without redirect_uri first (Self Client flow)
    let response;
    try {
      response = await axios.post(tokenUrl, null, {
        params: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (firstError) {
      // If invalid_grant or invalid_code, try with redirect_uri
      if (firstError.response?.data?.error === 'invalid_grant' || 
          firstError.response?.data?.error === 'invalid_code') {
        console.log('   ⚠️  First attempt failed, trying with redirect_uri...');
        params.redirect_uri = redirectUri;
        response = await axios.post(tokenUrl, null, {
          params: params,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
      } else {
        throw firstError;
      }
    }
    
    // Check response
    if (response.data.error) {
      throw new Error(`Zoho API error: ${response.data.error} - ${response.data.error_description || ''}`);
    }
    
    // Extract tokens from response
    const { access_token, refresh_token, expires_in, token_type } = response.data;
    
    if (!access_token) {
      throw new Error('No access_token in response: ' + JSON.stringify(response.data));
    }
    
    if (!refresh_token) {
      throw new Error('No refresh_token in response. Make sure access_type=offline was used during authorization.');
    }
    
    console.log('✅ Successfully obtained tokens from Zoho');
    console.log(`   Access token: ${access_token.substring(0, 20)}...`);
    console.log(`   Refresh token: ${refresh_token.substring(0, 20)}...`);
    console.log(`   Expires in: ${expires_in} seconds (${Math.round(expires_in / 3600)} hours)`);
    console.log(`   Token type: ${token_type || 'Bearer'}`);
    
    return {
      access_token,
      refresh_token,
      expires_in,
      token_type: token_type || 'Bearer',
    };
  } catch (error) {
    if (error.response) {
      // Zoho API error response
      const errorData = error.response.data;
      console.error('❌ Zoho API error response:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(errorData, null, 2)}`);
      
      if (errorData.error === 'invalid_grant') {
        throw new Error(
          'Invalid authorization code. The code may be expired or already used. ' +
          'You need to generate a new authorization code from Zoho Developer Console.'
        );
      }
      if (errorData.error === 'invalid_client') {
        throw new Error(
          'Invalid client credentials. Check your client_id and client_secret in self_client.json.'
        );
      }
      throw new Error(`Zoho API error: ${errorData.error} - ${errorData.error_description || ''}`);
    }
    throw error;
  }
}

/**
 * Step 3: Store tokens securely in database
 * 
 * Stores the access_token and refresh_token in the database for the specified tenant.
 * The refresh_token is stored for long-term use (doesn't expire unless revoked).
 * 
 * Security:
 * - Tokens are stored in database, not in files
 * - Access tokens expire and are refreshed automatically
 * - Refresh tokens are used to get new access tokens
 */
async function storeTokensSecurely(tenantId, tokens) {
  console.log('\n💾 Step 3: Storing tokens securely in database...');
  
  const client = await pool.connect();
  try {
    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    
    // Insert or update tokens in database
    // Using ON CONFLICT to update if tokens already exist for this tenant
    await client.query(
      `INSERT INTO zoho_tokens (tenant_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) 
       DO UPDATE SET 
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [tenantId, tokens.access_token, tokens.refresh_token, expiresAt]
    );
    
    console.log('✅ Tokens stored securely in database');
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   Expires at: ${expiresAt.toLocaleString()}`);
    console.log(`   Refresh token saved for long-term use`);
  } catch (error) {
    if (error.code === '42P01') {
      throw new Error(
        'zoho_tokens table does not exist. Please run the database migrations first:\n' +
        '  node scripts/apply-zoho-migrations-simple.js'
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Step 4: Demonstrate using refresh token for future requests
 * 
 * This function shows how to use the stored refresh_token to get a new
 * access_token when the current one expires. This is the standard flow
 * for long-term token management.
 */
async function demonstrateRefreshTokenUsage(tenantId) {
  console.log('\n🔄 Step 4: Demonstrating refresh token usage...');
  
  const client = await pool.connect();
  try {
    // Get stored tokens from database
    const tokenResult = await client.query(
      `SELECT refresh_token, expires_at FROM zoho_tokens WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log('   ⚠️  No tokens found in database');
      return;
    }
    
    const { refresh_token, expires_at } = tokenResult.rows[0];
    const expiresAt = new Date(expires_at);
    const now = new Date();
    
    console.log(`   Current token expires at: ${expiresAt.toLocaleString()}`);
    console.log(`   Current time: ${now.toLocaleString()}`);
    
    if (expiresAt > now) {
      console.log(`   ✅ Token is still valid (expires in ${Math.round((expiresAt - now) / 1000 / 60)} minutes)`);
      console.log('   No refresh needed yet.');
    } else {
      console.log('   ⚠️  Token has expired. Would refresh using refresh_token...');
      // In production, you would call refreshAccessToken here
      // await zohoService.refreshAccessToken(tenantId, refresh_token);
    }
    
    console.log('\n   📝 How to refresh tokens in your code:');
    console.log('   ```javascript');
    console.log('   // Use zohoService.refreshAccessToken() method');
    console.log('   const accessToken = await zohoService.refreshAccessToken(tenantId, refreshToken);');
    console.log('   ```');
    console.log('\n   The refresh token is stored in the database and can be used');
    console.log('   multiple times to get new access tokens.');
    
  } finally {
    client.release();
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Zoho Self Client Token Exchange\n');
  console.log('='.repeat(60));
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Read credentials from self_client.json
    const credentials = readSelfClientJson();
    
    // Step 2: Exchange code for tokens
    const tokens = await exchangeCodeForTokens(credentials);
    
    // Step 3: Store tokens securely
    await storeTokensSecurely(TENANT_ID, tokens);
    
    // Step 4: Demonstrate refresh token usage
    await demonstrateRefreshTokenUsage(TENANT_ID);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS! Token exchange completed successfully');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log(`   ✅ Authorization code exchanged for tokens`);
    console.log(`   ✅ Tokens stored securely in database for tenant: ${TENANT_ID}`);
    console.log(`   ✅ Refresh token saved for long-term use`);
    console.log(`   ✅ Access token expires at: ${new Date(Date.now() + tokens.expires_in * 1000).toLocaleString()}`);
    console.log('\n💡 Next steps:');
    console.log('   1. You can now use zohoService.getAccessToken(tenantId) to get valid tokens');
    console.log('   2. The service will automatically refresh tokens when they expire');
    console.log('   3. Create invoices using: node scripts/create-invoice-simple-api.js');
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERROR: Token exchange failed');
    console.error('='.repeat(60));
    console.error(`\n${error.message}`);
    
    if (error.message.includes('invalid_grant') || error.message.includes('invalid_code')) {
      console.error('\n💡 Solution:');
      console.error('   The authorization code is expired or already used.');
      console.error('   Authorization codes are one-time use and expire quickly.');
      console.error('\n   To get a new authorization code:');
      console.error('   1. Go to https://api-console.zoho.com/');
      console.error('   2. Sign in with your Zoho account');
      console.error('   3. Find your client application');
      console.error('   4. Click "Generate Code" or "Authorize"');
      console.error('   5. Copy the authorization code');
      console.error('   6. Update self_client.json with the new code:');
      console.error('      {');
      console.error('        "client_id": "...",');
      console.error('        "client_secret": "...",');
      console.error('        "code": "NEW_CODE_HERE",');
      console.error('        "grant_type": "authorization_code"');
      console.error('      }');
      console.error('\n   Alternative: Use OAuth redirect flow instead:');
      console.error('   http://localhost:3001/api/zoho/auth?tenant_id=63107b06-938e-4ce6-b0f3-520a87db397b');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

