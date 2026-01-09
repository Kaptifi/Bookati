/**
 * Test SMTP Email Sending from Database Settings
 * 
 * This script:
 * 1. Saves SMTP settings to database for a tenant
 * 2. Sends a test email using those settings
 * 
 * Usage: node scripts/test-smtp-from-db.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function testSmtpFromDb() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing SMTP Email from Database Settings\n');
    console.log('='.repeat(60));

    // SMTP settings to save
    const smtpSettings = {
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_user: 'mahmoudnzaineldeen@gmail.com',
      smtp_password: 'jvqz mkxi yglz pbvm', // App password (spaces will be removed)
    };

    // Email to send to
    const toEmail = 'kaptifidev@gmail.com';

    // Get first tenant (or use a specific tenant ID)
    console.log('\n📋 Step 1: Finding tenant...');
    const tenantResult = await client.query(
      'SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1'
    );

    if (tenantResult.rows.length === 0) {
      console.error('❌ No tenants found in database');
      return;
    }

    const tenant = tenantResult.rows[0];
    const tenantId = tenant.id;
    console.log(`✅ Found tenant: ${tenant.name} (${tenantId})`);

    // Save SMTP settings to database
    console.log('\n📋 Step 2: Saving SMTP settings to database...');
    console.log(`   Host: ${smtpSettings.smtp_host}`);
    console.log(`   Port: ${smtpSettings.smtp_port}`);
    console.log(`   User: ${smtpSettings.smtp_user}`);
    console.log(`   Password: ${'*'.repeat(smtpSettings.smtp_password.length)}`);

    await client.query(
      `UPDATE tenants 
       SET smtp_settings = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [JSON.stringify(smtpSettings), tenantId]
    );

    console.log('✅ SMTP settings saved to database');

    // Verify settings were saved
    console.log('\n📋 Step 3: Verifying saved settings...');
    const verifyResult = await client.query(
      'SELECT smtp_settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    const savedSettings = verifyResult.rows[0].smtp_settings;
    if (!savedSettings || !savedSettings.smtp_user) {
      console.error('❌ Settings were not saved correctly');
      return;
    }

    console.log('✅ Settings verified in database');
    console.log(`   User: ${savedSettings.smtp_user}`);
    console.log(`   Host: ${savedSettings.smtp_host}`);

    // Create transporter from database settings
    console.log('\n📋 Step 4: Creating SMTP transporter from database settings...');
    const transporter = nodemailer.createTransport({
      host: savedSettings.smtp_host || 'smtp.gmail.com',
      port: parseInt(String(savedSettings.smtp_port || 587)),
      secure: false,
      auth: {
        user: savedSettings.smtp_user,
        pass: savedSettings.smtp_password.replace(/\s/g, ''), // Remove spaces from app password
      },
      tls: {
        rejectUnauthorized: false, // For development
      },
    });

    console.log('✅ Transporter created');

    // Verify connection
    console.log('\n📋 Step 5: Verifying SMTP connection...');
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified');
    } catch (verifyError) {
      console.error('❌ SMTP verification failed:', verifyError.message);
      return;
    }

    // Send test email
    console.log('\n📋 Step 6: Sending test email...');
    console.log(`   From: ${savedSettings.smtp_user}`);
    console.log(`   To: ${toEmail}`);

    const mailResult = await transporter.sendMail({
      from: `"Test Email" <${savedSettings.smtp_user}>`,
      to: toEmail,
      subject: 'Test Email from Database SMTP Settings',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">✅ Test Email Successful!</h2>
          <p>This is a test email sent using SMTP settings from the database.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p><strong>SMTP Configuration:</strong></p>
          <ul>
            <li>Host: ${savedSettings.smtp_host}</li>
            <li>Port: ${savedSettings.smtp_port}</li>
            <li>User: ${savedSettings.smtp_user}</li>
            <li>Source: Database (tenants.smtp_settings)</li>
          </ul>
          <p style="color: #666; margin-top: 20px;">
            If you received this email, it means the system is now correctly using SMTP settings from the database instead of environment variables! 🎉
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">This is an automated test email.</p>
        </div>
      `,
      text: 'This is a test email sent using SMTP settings from the database. If you received this, the system is working correctly!',
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${mailResult.messageId}`);
    console.log(`   Response: ${mailResult.response}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test Complete!');
    console.log('='.repeat(60));
    console.log('\n📧 Check the inbox of:', toEmail);
    console.log('   The email should arrive within a few seconds.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response);
    }
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testSmtpFromDb();
