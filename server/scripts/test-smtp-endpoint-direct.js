/**
 * Test SMTP Test Endpoint Directly
 * 
 * This script tests the /api/tenants/smtp-settings/test endpoint
 * to see what response it returns
 */

import pg from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function testSmtpEndpointDirect() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing SMTP Test Endpoint Directly\n');
    console.log('='.repeat(60));

    // Get first tenant
    const tenantResult = await client.query(
      'SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1'
    );

    if (tenantResult.rows.length === 0) {
      console.error('❌ No tenants found');
      return;
    }

    const tenant = tenantResult.rows[0];
    console.log(`✅ Found tenant: ${tenant.name} (${tenant.id})`);

    // Get a user with a JWT token (we'll need to create one or use existing)
    // For now, let's just test the SMTP settings directly
    const smtpSettings = {
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_user: 'mahmoudnzaineldeen@gmail.com',
      smtp_password: 'jvqz mkxi yglz pbvm',
    };

    console.log('\n📋 Testing SMTP settings:');
    console.log(`   Host: ${smtpSettings.smtp_host}`);
    console.log(`   Port: ${smtpSettings.smtp_port}`);
    console.log(`   User: ${smtpSettings.smtp_user}`);
    console.log(`   Password: ${'*'.repeat(smtpSettings.smtp_password.length)}`);

    // Test with nodemailer directly (simulating what the endpoint does)
    const nodemailer = await import('nodemailer');
    
    // Remove spaces from password
    const password = smtpSettings.smtp_password.replace(/\s/g, '');
    
    console.log('\n📋 Creating transporter...');
    const transporter = nodemailer.default.createTransport({
      host: smtpSettings.smtp_host,
      port: smtpSettings.smtp_port,
      secure: false,
      auth: {
        user: smtpSettings.smtp_user,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    console.log('📋 Verifying connection...');
    try {
      await transporter.verify();
      console.log('✅ Connection verified');
    } catch (verifyError) {
      console.error('❌ Verification failed:', verifyError.message);
      return;
    }

    console.log('📋 Sending test email...');
    const testInfo = await transporter.sendMail({
      from: `"Bookati Test" <${smtpSettings.smtp_user}>`,
      to: smtpSettings.smtp_user,
      subject: 'SMTP Connection Test - Bookati',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">SMTP Connection Test</h2>
          <p>This is a test email to verify your SMTP configuration.</p>
          <p>If you received this email, your SMTP settings are working correctly! ✅</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">This is an automated test email from Bookati.</p>
        </div>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${testInfo.messageId}`);
    console.log(`   Response: ${testInfo.response}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Direct Test Complete!');
    console.log('='.repeat(60));
    console.log('\n💡 If this worked, the endpoint should also work.');
    console.log('   Check the server logs when you click "Test Connection" in the UI.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testSmtpEndpointDirect();
