/**
 * Test WhatsApp Message Sending from Database Settings
 * 
 * This script tests sending a WhatsApp message using settings from the database
 * Usage: node scripts/test-whatsapp-send.js +201032560826
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

async function testWhatsAppSend(phoneNumber) {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing WhatsApp Message Sending from Database\n');
    console.log('='.repeat(60));
    console.log(`📱 Phone Number: ${phoneNumber}\n`);

    // Get first tenant
    console.log('📋 Step 1: Finding tenant...');
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
    console.log(`   Provider: ${settings.provider || 'not set'}`);
    console.log(`   Phone Number ID: ${settings.phone_number_id ? 'SET ✅' : 'NOT SET ❌'}`);
    console.log(`   Access Token: ${settings.access_token ? 'SET ✅' : 'NOT SET ❌'}`);

    if (!settings.provider) {
      console.error('❌ Provider not set in WhatsApp settings');
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

    // Import WhatsApp service (using tsx to run TypeScript)
    console.log('\n📋 Step 3: Importing WhatsApp service...');
    const { sendOTPWhatsApp } = await import('../src/services/whatsappService.ts');
    console.log('✅ WhatsApp service imported');

    // Send test message
    console.log('\n📋 Step 4: Sending test WhatsApp message...');
    console.log(`   To: ${phoneNumber}`);
    console.log(`   Provider: ${whatsappConfig.provider}`);
    
    const testOTP = '123456';
    const result = await sendOTPWhatsApp(
      phoneNumber,
      testOTP,
      'en',
      whatsappConfig
    );

    if (result.success) {
      console.log('\n✅ WhatsApp message sent successfully!');
      console.log('='.repeat(60));
      console.log(`📱 Message sent to: ${phoneNumber}`);
      console.log(`   Test OTP: ${testOTP}`);
      console.log(`   Provider: ${whatsappConfig.provider}`);
    } else {
      console.error('\n❌ Failed to send WhatsApp message');
      console.error(`   Error: ${result.error}`);
      console.error('='.repeat(60));
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

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log('❌ Please provide a phone number');
  console.log('Usage: node scripts/test-whatsapp-send.js +201032560826');
  process.exit(1);
}

testWhatsAppSend(phoneNumber);
