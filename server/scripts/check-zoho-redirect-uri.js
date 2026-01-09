/**
 * Diagnostic script to check what redirect URI is configured for a tenant
 * and what will be used in the OAuth flow
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

const tenantId = process.argv[2];

if (!tenantId) {
  console.log('Usage: node check-zoho-redirect-uri.js <tenant_id>');
  console.log('Example: node check-zoho-redirect-uri.js 63107b06-938e-4ce6-b0f3-520a87db397b');
  process.exit(1);
}

async function checkRedirectUri() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking Zoho Redirect URI Configuration\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${tenantId}\n`);

    // Check database config
    const configResult = await client.query(
      `SELECT client_id, redirect_uri, region, is_active 
       FROM tenant_zoho_configs 
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      console.log('📋 Database Configuration:');
      console.log(`   Client ID: ${config.client_id ? config.client_id.substring(0, 15) + '...' : '(not set)'}`);
      console.log(`   Redirect URI: ${config.redirect_uri || '(not set, will use default)'}`);
      console.log(`   Region: ${config.region || 'com'}`);
      console.log(`   Active: ${config.is_active}\n`);

      // Determine what will actually be used
      const actualRedirectUri = config.redirect_uri || process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
      
      console.log('🔗 Redirect URI that will be used in OAuth:');
      console.log(`   ${actualRedirectUri}\n`);

      // Check default
      const defaultUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
      console.log('⚙️  Default Redirect URI (from env or hardcoded):');
      console.log(`   ${defaultUri}\n`);

      // Compare
      console.log('📊 Comparison:');
      if (config.redirect_uri) {
        if (config.redirect_uri === actualRedirectUri) {
          console.log('   ✅ Database URI matches what will be used');
        } else {
          console.log('   ⚠️  Database URI does NOT match what will be used!');
          console.log(`      Database: ${config.redirect_uri}`);
          console.log(`      Will use: ${actualRedirectUri}`);
        }
      } else {
        console.log('   ⚠️  No redirect_uri in database, using default');
      }

      console.log('\n📝 Instructions:');
      console.log('   1. Copy this EXACT redirect URI:');
      console.log(`      ${actualRedirectUri}`);
      console.log('   2. Go to Zoho Developer Console: https://api-console.zoho.com/');
      console.log('   3. Find your application (Client ID: ' + (config.client_id ? config.client_id.substring(0, 15) + '...' : 'N/A') + ')');
      console.log('   4. Click "Edit" or "Settings"');
      console.log('   5. Find "Authorized Redirect URIs" section');
      console.log('   6. Add this EXACT URI (copy-paste, no modifications):');
      console.log(`      ${actualRedirectUri}`);
      console.log('   7. Make sure there are:');
      console.log('      - No trailing slashes');
      console.log('      - No extra spaces');
      console.log('      - Exact match (case-sensitive for domain)');
      console.log('   8. Click "Save" or "Update"');
      console.log('   9. Wait 10-30 seconds for changes to propagate');
      console.log('   10. Try "Connect to Zoho" again\n');

      // Check if URI needs to be updated in database
      if (!config.redirect_uri || config.redirect_uri !== actualRedirectUri) {
        console.log('💡 Tip: You can update the redirect_uri in the database:');
        console.log(`   UPDATE tenant_zoho_configs SET redirect_uri = '${actualRedirectUri}' WHERE tenant_id = '${tenantId}';`);
        console.log('   Or update it in Settings page → Zoho Integration → Redirect URI field\n');
      }

    } else {
      console.log('❌ No Zoho configuration found for this tenant');
      console.log('   Please save your Zoho credentials in Settings first\n');
      
      const defaultUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/api/zoho/callback';
      console.log('📝 Default redirect URI that will be used:');
      console.log(`   ${defaultUri}\n`);
      console.log('   Add this to Zoho Developer Console → Authorized Redirect URIs');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkRedirectUri().catch(console.error);

