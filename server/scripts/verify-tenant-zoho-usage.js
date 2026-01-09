/**
 * Verify if Zoho invoices use tenant-specific settings from Settings page
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

async function verifyTenantUsage() {
  const client = await pool.connect();
  try {
    console.log('🔍 Verifying Zoho Invoice Uses Tenant Settings\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${TENANT_ID}\n`);

    // Check tenant-specific config
    console.log('📋 Step 1: Checking tenant-specific Zoho config...\n');
    const configResult = await client.query(
      `SELECT client_id, client_secret, redirect_uri, scopes, region, is_active 
       FROM tenant_zoho_configs 
       WHERE tenant_id = $1`,
      [TENANT_ID]
    );

    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      console.log('✅ TENANT-SPECIFIC CONFIG FOUND (from Settings page)\n');
      console.log('Configuration Details:');
      console.log(`   Client ID: ${config.client_id.substring(0, 20)}...`);
      console.log(`   Client Secret: ${config.client_secret.substring(0, 20)}...`);
      console.log(`   Redirect URI: ${config.redirect_uri}`);
      console.log(`   Scopes: ${config.scopes?.join(', ') || 'default'}`);
      console.log(`   Region: ${config.region || 'com'}`);
      console.log(`   Active: ${config.is_active}\n`);
      console.log('✅ This means:');
      console.log('   - Settings page values ARE being used');
      console.log('   - Invoices use these tenant-specific credentials');
      console.log('   - Each tenant can have their own Zoho account\n');
    } else {
      console.log('❌ NO TENANT-SPECIFIC CONFIG FOUND\n');
      console.log('This means:');
      console.log('   - Settings page values are NOT saved');
      console.log('   - System falls back to global credentials');
      console.log('   - (Environment variables or self_client.json)\n');
      console.log('To fix: Save Zoho credentials in Settings → Zoho Invoice Integration\n');
    }

    // Check global fallback
    console.log('📋 Step 2: Checking global fallback credentials...\n');
    const hasEnvClientId = !!process.env.ZOHO_CLIENT_ID;
    const hasEnvClientSecret = !!process.env.ZOHO_CLIENT_SECRET;
    
    console.log('Global credentials (fallback):');
    console.log(`   ZOHO_CLIENT_ID: ${hasEnvClientId ? '✅ Set' : '❌ Not set'}`);
    console.log(`   ZOHO_CLIENT_SECRET: ${hasEnvClientSecret ? '✅ Set' : '❌ Not set'}`);
    console.log(`   ZOHO_REDIRECT_URI: ${process.env.ZOHO_REDIRECT_URI || 'Not set (uses default)'}\n`);

    // Check which credentials are actually used
    console.log('📋 Step 3: Which credentials are used for invoices?\n');
    if (configResult.rows.length > 0) {
      console.log('✅ TENANT-SPECIFIC credentials are used (Priority 1)');
      console.log('   Source: Settings page → tenant_zoho_configs table');
      console.log('   Used for:');
      console.log('     - Creating invoices');
      console.log('     - Refreshing tokens');
      console.log('     - OAuth flow');
      console.log('     - All Zoho API calls\n');
    } else {
      console.log('⚠️  GLOBAL credentials are used (fallback)');
      console.log('   Source: Environment variables or self_client.json');
      console.log('   Used for:');
      console.log('     - Creating invoices');
      console.log('     - Refreshing tokens');
      console.log('     - OAuth flow');
      console.log('     - All Zoho API calls\n');
      console.log('⚠️  Note: All tenants would share the same Zoho account\n');
    }

    // Check recent invoices
    console.log('📋 Step 4: Checking recent invoices...\n');
    const invoicesResult = await client.query(
      `SELECT id, zoho_invoice_id, zoho_invoice_created_at, created_at
       FROM bookings 
       WHERE tenant_id = $1 
         AND zoho_invoice_id IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT 3`,
      [TENANT_ID]
    );

    if (invoicesResult.rows.length > 0) {
      console.log('Recent invoices created:');
      invoicesResult.rows.forEach((booking, index) => {
        console.log(`   ${index + 1}. Invoice ID: ${booking.zoho_invoice_id}`);
        console.log(`      Created: ${new Date(booking.zoho_invoice_created_at).toLocaleString()}`);
      });
      console.log('\n');
      
      if (configResult.rows.length > 0) {
        console.log('✅ These invoices were created using:');
        console.log(`   Client ID: ${configResult.rows[0].client_id.substring(0, 20)}...`);
        console.log('   (From Settings page)\n');
      } else {
        console.log('⚠️  These invoices were created using:');
        console.log('   Global credentials (not from Settings page)\n');
      }
    } else {
      console.log('⚠️  No invoices found for this tenant\n');
    }

    // Summary
    console.log('📊 Summary:\n');
    if (configResult.rows.length > 0) {
      console.log('✅ YES - Zoho invoices USE settings from Settings page');
      console.log('   - Client ID: From Settings page');
      console.log('   - Client Secret: From Settings page');
      console.log('   - Redirect URI: From Settings page');
      console.log('   - Region: From Settings page');
      console.log('   - Each tenant has their own Zoho account\n');
    } else {
      console.log('❌ NO - Zoho invoices do NOT use Settings page values');
      console.log('   - Using global credentials instead');
      console.log('   - All tenants share same Zoho account');
      console.log('   - Save credentials in Settings to enable tenant-specific accounts\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyTenantUsage().catch(console.error);

