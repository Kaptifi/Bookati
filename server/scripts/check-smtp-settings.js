/**
 * Check SMTP Settings in Database
 * 
 * This script checks if SMTP settings are configured for tenants
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

async function checkSmtpSettings() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking SMTP Settings in Database\n');
    console.log('='.repeat(70));

    // Get all tenants
    const tenantResult = await client.query(
      'SELECT id, name, smtp_settings FROM tenants ORDER BY created_at ASC'
    );

    if (tenantResult.rows.length === 0) {
      console.error('❌ No tenants found');
      return;
    }

    console.log(`\n📋 Found ${tenantResult.rows.length} tenant(s):\n`);

    for (const tenant of tenantResult.rows) {
      console.log(`📌 Tenant: ${tenant.name} (${tenant.id})`);
      
      if (!tenant.smtp_settings) {
        console.log('   ❌ SMTP settings: NOT CONFIGURED');
        console.log('   💡 Please configure SMTP settings in the Settings page');
      } else {
        const smtp = tenant.smtp_settings;
        console.log('   ✅ SMTP settings: CONFIGURED');
        console.log(`      Host: ${smtp.smtp_host || 'not set'} (default: smtp.gmail.com)`);
        console.log(`      Port: ${smtp.smtp_port || 'not set'} (default: 587)`);
        console.log(`      User: ${smtp.smtp_user || 'NOT SET ❌'}`);
        console.log(`      Password: ${smtp.smtp_password ? 'SET ✅' : 'NOT SET ❌'}`);
        
        if (!smtp.smtp_user || !smtp.smtp_password) {
          console.log('   ⚠️  SMTP settings incomplete - email sending will fail');
        } else {
          console.log('   ✅ SMTP settings complete - email sending should work');
        }
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('\n💡 To configure SMTP settings:');
    console.log('   1. Go to Settings page in the admin panel');
    console.log('   2. Scroll to "Email Settings (SMTP)" section');
    console.log('   3. Fill in:');
    console.log('      - SMTP Host: smtp.gmail.com');
    console.log('      - SMTP Port: 587');
    console.log('      - Email Address: your-email@gmail.com');
    console.log('      - App Password: your-gmail-app-password');
    console.log('   4. Click "Test Connection" to verify');
    console.log('   5. Click "Save SMTP Settings"');

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

checkSmtpSettings();
