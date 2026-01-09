/**
 * Test WhatsApp with Saved Database Configurations
 * 
 * This script:
 * 1. Fetches WhatsApp settings from database
 * 2. Tests the connection using saved configurations
 * 3. Sends a test message to verify everything works
 * 
 * Usage: node scripts/test-whatsapp-saved-config.js [phone_number]
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

async function testWhatsAppWithSavedConfig(phoneNumber) {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing WhatsApp with Saved Database Configurations\n');
    console.log('='.repeat(70));

    // Get first tenant
    console.log('\n📋 Step 1: Finding tenant...');
    const tenantResult = await client.query(
      'SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1'
    );

    if (tenantResult.rows.length === 0) {
      console.error('❌ No tenants found');
      return;
    }

    const tenant = tenantResult.rows[0];
    const tenantId = tenant.id;
    console.log(`✅ Found tenant: ${tenant.name} (${tenantId})`);

    // Get WhatsApp settings from database
    console.log('\n📋 Step 2: Fetching WhatsApp settings from database...');
    const whatsappResult = await client.query(
      'SELECT whatsapp_settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (whatsappResult.rows.length === 0 || !whatsappResult.rows[0].whatsapp_settings) {
      console.error('❌ WhatsApp settings not found in database');
      console.error('   Please configure WhatsApp settings in the tenant settings page');
      return;
    }

    const settings = whatsappResult.rows[0].whatsapp_settings;
    console.log('✅ WhatsApp settings found in database');
    console.log('\n📋 Saved Configuration:');
    console.log(`   Provider: ${settings.provider || 'NOT SET ❌'}`);
    console.log(`   Phone Number ID: ${settings.phone_number_id ? settings.phone_number_id : 'NOT SET ❌'}`);
    console.log(`   Access Token: ${settings.access_token ? 'SET ✅ (' + settings.access_token.substring(0, 20) + '...)' : 'NOT SET ❌'}`);
    console.log(`   API URL: ${settings.api_url || 'not set'}`);
    console.log(`   API Key: ${settings.api_key ? 'SET ✅' : 'not set'}`);
    console.log(`   Account SID: ${settings.account_sid || 'not set'}`);
    console.log(`   Auth Token: ${settings.auth_token ? 'SET ✅' : 'not set'}`);
    console.log(`   From: ${settings.from || 'not set'}`);

    if (!settings.provider) {
      console.error('\n❌ Provider not set in WhatsApp settings');
      return;
    }

    // Convert database settings to config format
    const whatsappConfig = {
      provider: settings.provider,
      apiUrl: settings.api_url,
      apiKey: settings.api_key,
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      accountSid: settings.account_sid,
      authToken: settings.auth_token,
      from: settings.from,
    };

    // Validate required fields
    console.log('\n📋 Step 3: Validating configuration...');
    if (whatsappConfig.provider === 'meta') {
      if (!whatsappConfig.phoneNumberId || !whatsappConfig.accessToken) {
        console.error('❌ Validation failed:');
        console.error(`   Phone Number ID: ${whatsappConfig.phoneNumberId ? 'SET ✅' : 'MISSING ❌'}`);
        console.error(`   Access Token: ${whatsappConfig.accessToken ? 'SET ✅' : 'MISSING ❌'}`);
        console.error('\n   Please configure Phone Number ID and Access Token in tenant settings.');
        return;
      }
      console.log('✅ Meta provider validation passed');
    } else if (whatsappConfig.provider === 'twilio') {
      if (!whatsappConfig.accountSid || !whatsappConfig.authToken) {
        console.error('❌ Validation failed: Account SID and Auth Token are required for Twilio');
        return;
      }
      console.log('✅ Twilio provider validation passed');
    } else if (whatsappConfig.provider === 'wati') {
      if (!whatsappConfig.apiKey) {
        console.error('❌ Validation failed: API Key is required for WATI');
        return;
      }
      console.log('✅ WATI provider validation passed');
    }

    // Import WhatsApp service
    console.log('\n📋 Step 4: Testing connection...');
    const { testWhatsAppConnection } = await import('../src/services/whatsappService.ts');
    
    const testResult = await testWhatsAppConnection(whatsappConfig);
    
    if (!testResult.success) {
      console.error('❌ Connection test failed');
      console.error(`   Error: ${testResult.error}`);
      return;
    }
    
    console.log('✅ Connection test successful!');

    // If phone number provided, send test message
    if (phoneNumber) {
      console.log(`\n📋 Step 5: Sending test message to ${phoneNumber}...`);
      const { sendOTPWhatsApp } = await import('../src/services/whatsappService.ts');
      
      const testOTP = '123456';
      const result = await sendOTPWhatsApp(
        phoneNumber,
        testOTP,
        'en',
        whatsappConfig
      );

      if (result.success) {
        console.log('\n✅ Test message sent successfully!');
        console.log('='.repeat(70));
        console.log(`📱 Message Details:`);
        console.log(`   To: ${phoneNumber}`);
        console.log(`   Test OTP: ${testOTP}`);
        console.log(`   Provider: ${whatsappConfig.provider}`);
        console.log(`   Phone Number ID: ${whatsappConfig.phoneNumberId || 'N/A'}`);
        console.log('='.repeat(70));
        console.log('\n💡 Check the recipient\'s WhatsApp to verify the message was received.');
      } else {
        console.error('\n❌ Failed to send test message');
        console.error(`   Error: ${result.error}`);
      }
    } else {
      console.log('\n✅ Configuration test complete!');
      console.log('💡 To send a test message, provide a phone number:');
      console.log('   node scripts/test-whatsapp-saved-config.js +201032560826');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Get phone number from command line argument (optional)
const phoneNumber = process.argv[2];

testWhatsAppWithSavedConfig(phoneNumber);
