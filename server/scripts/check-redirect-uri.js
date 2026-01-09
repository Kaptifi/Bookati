import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

console.log('🔍 Zoho Redirect URI Check\n');
console.log('='.repeat(60));

try {
  // Get redirect URI from env or default
  const redirectUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
  
  // Get client ID from env or self_client.json
  let clientId = process.env.ZOHO_CLIENT_ID;
  if (!clientId) {
    try {
      const selfClientPath = join(__dirname, '..', 'self_client.json');
      const selfClientData = JSON.parse(readFileSync(selfClientPath, 'utf8'));
      clientId = selfClientData.client_id;
    } catch (e) {
      // Ignore
    }
  }
  
  console.log('\n📋 Current Configuration:');
  if (clientId) {
    console.log(`   Client ID: ${clientId.substring(0, 15)}...`);
  } else {
    console.log('   Client ID: NOT FOUND');
  }
  console.log(`   Redirect URI: ${redirectUri}`);
  
  console.log('\n💡 To fix the "Invalid Redirect URI" error:');
  console.log('\n   Option 1: Update Zoho Developer Console (Recommended)');
  console.log('   1. Go to https://api-console.zoho.com/');
  console.log('   2. Sign in with your Zoho account');
  console.log('   3. Find your client application (Client ID starts with: ' + (clientId ? clientId.substring(0, 15) + '...' : 'N/A') + ')');
  console.log('   4. Click "Edit" or "Settings"');
  console.log('   5. In "Authorized Redirect URIs" section, add:');
  console.log(`      ${redirectUri}`);
  console.log('   6. Click "Save" or "Update"');
  console.log('   7. Wait a few seconds for changes to propagate');
  console.log('   8. Try the OAuth flow again');
  
  console.log('\n   Option 2: Update Environment Variable (if Zoho uses different URI)');
  console.log('   1. Check what redirect URI is configured in Zoho Developer Console');
  console.log('   2. Add to server/.env file:');
  console.log(`      ZOHO_REDIRECT_URI=<your_configured_redirect_uri>`);
  console.log('   3. Restart the server');
  
  console.log('\n📝 Common Redirect URIs to try:');
  console.log('   - http://localhost:3001/api/zoho/callback');
  console.log('   - http://localhost:3001/zoho/callback');
  console.log('   - http://127.0.0.1:3001/api/zoho/callback');
  console.log('   - https://yourdomain.com/api/zoho/callback');
  
  if (clientId) {
    console.log('\n🔗 OAuth URL to test (after updating Zoho):');
    const tenantId = '63107b06-938e-4ce6-b0f3-520a87db397b';
    const scope = 'ZohoInvoice.invoices.CREATE,ZohoInvoice.invoices.READ,ZohoInvoice.invoices.UPDATE';
    const state = Buffer.from(JSON.stringify({ tenant_id: tenantId })).toString('base64');
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;
    console.log(`   ${authUrl}`);
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

