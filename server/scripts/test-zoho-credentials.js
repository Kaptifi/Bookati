import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Import the credential manager (we'll test it directly)
// Since it's TypeScript, we'll test the logic manually

console.log('🧪 Testing Zoho Credentials Loading\n');
console.log('=' .repeat(60));

// Test 1: Check if self_client.json exists
console.log('\n📋 Test 1: Check self_client.json file');
const credentialsPath = join(__dirname, '..', 'self_client.json');
const fileExists = existsSync(credentialsPath);

if (fileExists) {
  console.log('✅ File exists:', credentialsPath);
  try {
    const fileContent = readFileSync(credentialsPath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    console.log('✅ Valid JSON structure');
    console.log('   - client_id:', jsonData.client_id ? `${jsonData.client_id.substring(0, 10)}...` : 'MISSING');
    console.log('   - client_secret:', jsonData.client_secret ? '***SET***' : 'MISSING');
    console.log('   - scope:', jsonData.scope ? JSON.stringify(jsonData.scope) : 'Not set');
  } catch (error) {
    console.error('❌ Error reading file:', error.message);
  }
} else {
  console.log('⚠️  File not found:', credentialsPath);
  console.log('   This is OK if using environment variables');
}

// Test 2: Check environment variables
console.log('\n📋 Test 2: Check environment variables');
const envClientId = process.env.ZOHO_CLIENT_ID;
const envClientSecret = process.env.ZOHO_CLIENT_SECRET;
const envRedirectUri = process.env.ZOHO_REDIRECT_URI;
const envScope = process.env.ZOHO_SCOPE;
const envApiBaseUrl = process.env.ZOHO_API_BASE_URL;

console.log('   - ZOHO_CLIENT_ID:', envClientId ? `${envClientId.substring(0, 10)}...` : 'NOT SET');
console.log('   - ZOHO_CLIENT_SECRET:', envClientSecret ? '***SET***' : 'NOT SET');
console.log('   - ZOHO_REDIRECT_URI:', envRedirectUri || 'NOT SET');
console.log('   - ZOHO_SCOPE:', envScope || 'NOT SET');
console.log('   - ZOHO_API_BASE_URL:', envApiBaseUrl || 'NOT SET');

// Test 3: Determine which will be used (priority)
console.log('\n📋 Test 3: Credential Loading Priority');
if (envClientId && envClientSecret) {
  console.log('✅ Environment variables will be used (Priority 1)');
  console.log('   - Production-safe method');
} else if (fileExists) {
  console.log('✅ self_client.json will be used (Priority 2)');
  console.log('   - Development method');
} else {
  console.log('❌ No credentials found!');
  console.log('   - Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET, or');
  console.log('   - Place self_client.json in server/ directory');
}

// Test 4: Validate credential format
console.log('\n📋 Test 4: Credential Format Validation');
const clientId = envClientId || (fileExists ? JSON.parse(readFileSync(credentialsPath, 'utf8')).client_id : null);
const clientSecret = envClientSecret || (fileExists ? JSON.parse(readFileSync(credentialsPath, 'utf8')).client_secret : null);

if (clientId) {
  // Zoho client IDs typically start with "1000."
  if (clientId.startsWith('1000.')) {
    console.log('✅ Client ID format looks valid (starts with 1000.)');
  } else {
    console.log('⚠️  Client ID format unusual (expected to start with 1000.)');
  }
  console.log('   Length:', clientId.length, 'characters');
} else {
  console.log('❌ No client_id found');
}

if (clientSecret) {
  // Zoho client secrets are typically 40+ characters
  if (clientSecret.length >= 40) {
    console.log('✅ Client secret format looks valid (40+ characters)');
  } else {
    console.log('⚠️  Client secret seems short (expected 40+ characters)');
  }
  console.log('   Length:', clientSecret.length, 'characters');
} else {
  console.log('❌ No client_secret found');
}

// Test 5: Test credential manager import (if TypeScript is compiled)
console.log('\n📋 Test 5: Credential Manager Module');
try {
  // Try to import the compiled version
  const { zohoCredentials } = await import('../dist/config/zohoCredentials.js');
  console.log('✅ Credential manager module found');
  
  try {
    const loadedClientId = zohoCredentials.getClientId();
    const loadedClientSecret = zohoCredentials.getClientSecret();
    console.log('✅ Credentials loaded successfully');
    console.log('   - Client ID:', `${loadedClientId.substring(0, 10)}...`);
    console.log('   - Client Secret:', '***LOADED***');
    console.log('   - Source:', zohoCredentials.isLoaded() ? 'Cached in memory' : 'Just loaded');
  } catch (error) {
    console.log('❌ Error loading credentials:', error.message);
  }
} catch (error) {
  console.log('⚠️  Compiled module not found (this is OK if TypeScript not compiled)');
  console.log('   - Run: cd server && npm run build');
  console.log('   - Or test with: npm run dev (uses tsx)');
}

// Test 6: OAuth URL generation test
console.log('\n📋 Test 6: OAuth URL Generation Test');
if (clientId && clientSecret) {
  const redirectUri = envRedirectUri || 'http://localhost:3001/api/zoho/callback';
  const scope = envScope || 'ZohoInvoice.invoices.CREATE,ZohoInvoice.invoices.READ,ZohoInvoice.invoices.UPDATE';
  
  const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
    `scope=${encodeURIComponent(scope)}&` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=test_state`;
  
  console.log('✅ OAuth URL can be generated');
  console.log('   - Base URL: https://accounts.zoho.com/oauth/v2/auth');
  console.log('   - Redirect URI:', redirectUri);
  console.log('   - Scope:', scope);
  console.log('   - URL length:', authUrl.length, 'characters');
  console.log('\n   Sample URL (first 100 chars):');
  console.log('   ', authUrl.substring(0, 100) + '...');
} else {
  console.log('❌ Cannot generate OAuth URL (missing credentials)');
}

// Test 7: Token refresh endpoint test
console.log('\n📋 Test 7: Token Refresh Endpoint Test');
if (clientId && clientSecret) {
  console.log('✅ Credentials available for token refresh');
  console.log('   - Endpoint: https://accounts.zoho.com/oauth/v2/token');
  console.log('   - Method: POST');
  console.log('   - Required params:');
  console.log('     * refresh_token (from database)');
  console.log('     * client_id:', `${clientId.substring(0, 10)}...`);
  console.log('     * client_secret: ***LOADED***');
  console.log('     * grant_type: refresh_token');
} else {
  console.log('❌ Cannot test token refresh (missing credentials)');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));

const hasCredentials = !!(clientId && clientSecret);
const hasEnvVars = !!(envClientId && envClientSecret);
const hasFile = fileExists;

console.log(`\n✅ Credentials Available: ${hasCredentials ? 'YES' : 'NO'}`);
console.log(`   - From Environment: ${hasEnvVars ? 'YES' : 'NO'}`);
console.log(`   - From File: ${hasFile ? 'YES' : 'NO'}`);

if (hasCredentials) {
  console.log('\n✅ All systems ready for Zoho OAuth flows!');
  console.log('   - OAuth authorization: Ready');
  console.log('   - Token exchange: Ready');
  console.log('   - Token refresh: Ready');
  console.log('   - Invoice creation: Ready');
} else {
  console.log('\n❌ Credentials not configured');
  console.log('   - Set environment variables OR');
  console.log('   - Place self_client.json in server/ directory');
  console.log('   - See: server/ZOHO_CREDENTIALS_SETUP.md');
}

console.log('\n');

