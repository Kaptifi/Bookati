#!/usr/bin/env node

/**
 * Email Integration Test Script
 * 
 * This script tests the email service configuration and sends a test email
 * to verify that emails are working correctly.
 * 
 * Usage: node scripts/test-email-integration.js [test-email@example.com]
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Get test email from command line or use default
const testEmail = process.argv[2] || process.env.TEST_EMAIL || 'test@example.com';

console.log('\n' + '='.repeat(60));
console.log('  EMAIL INTEGRATION TEST');
console.log('='.repeat(60) + '\n');

// Step 1: Check Configuration
console.log('📋 Step 1: Checking SMTP Configuration\n');

const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
  },
};

console.log('Configuration:');
console.log(`  SMTP_HOST: ${smtpConfig.host}`);
console.log(`  SMTP_PORT: ${smtpConfig.port}`);
console.log(`  SMTP_USER: ${smtpConfig.auth.user ? `${smtpConfig.auth.user.substring(0, 3)}***@${smtpConfig.auth.user.split('@')[1] || '***'}` : '❌ NOT SET'}`);
console.log(`  SMTP_PASSWORD: ${smtpConfig.auth.pass ? '✅ SET' : '❌ NOT SET'}`);
console.log(`  Test Email: ${testEmail}\n`);

// Validate configuration
if (!smtpConfig.auth.user) {
  console.error('❌ ERROR: SMTP_USER is not set in .env file');
  console.error('   Please add SMTP_USER=your-email@gmail.com to project/server/.env\n');
  process.exit(1);
}

if (!smtpConfig.auth.pass) {
  console.error('❌ ERROR: SMTP_PASSWORD is not set in .env file');
  console.error('   Please add SMTP_PASSWORD=your-app-password to project/server/.env');
  console.error('   For Gmail, use App Password (not regular password)\n');
  process.exit(1);
}

// Step 2: Create Transporter
console.log('🔧 Step 2: Creating SMTP Transporter\n');

let transporter;
try {
  transporter = nodemailer.createTransport(smtpConfig);
  console.log('✅ Transporter created successfully\n');
} catch (error) {
  console.error('❌ Failed to create transporter:', error.message);
  process.exit(1);
}

// Step 3: Verify Connection
console.log('🔍 Step 3: Verifying SMTP Connection\n');

try {
  await transporter.verify();
  console.log('✅ SMTP connection verified successfully!\n');
} catch (error) {
  console.error('❌ SMTP connection verification failed!\n');
  console.error('Error details:');
  console.error(`  Code: ${error.code}`);
  console.error(`  Command: ${error.command}`);
  console.error(`  Response: ${error.response}`);
  console.error(`  Message: ${error.message}\n`);
  
  console.log('💡 Common Issues:');
  console.log('  1. Wrong SMTP credentials');
  console.log('  2. Gmail: Need to use App Password (not regular password)');
  console.log('  3. Gmail: Enable "Less secure app access" or use App Password');
  console.log('  4. Firewall blocking port 587');
  console.log('  5. Wrong SMTP_HOST or SMTP_PORT\n');
  
  process.exit(1);
}

// Step 4: Send Test Email
console.log('📧 Step 4: Sending Test Email\n');

const testEmailContent = {
  from: `"Bookati Test" <${smtpConfig.auth.user}>`,
  to: testEmail,
  subject: 'Bookati Email Integration Test',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">✅ Email Integration Test</h2>
      <p>This is a test email from Bookati to verify email integration is working correctly.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p><strong>Test Details:</strong></p>
      <ul>
        <li>Sent at: ${new Date().toLocaleString()}</li>
        <li>From: ${smtpConfig.auth.user}</li>
        <li>To: ${testEmail}</li>
        <li>SMTP Host: ${smtpConfig.host}</li>
        <li>SMTP Port: ${smtpConfig.port}</li>
      </ul>
      <p style="color: #666; margin-top: 20px;">
        If you received this email, your email integration is working correctly! ✅
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">This is an automated test email from Bookati</p>
    </div>
  `,
  text: `Bookati Email Integration Test\n\nThis is a test email to verify email integration is working.\n\nSent at: ${new Date().toLocaleString()}\nFrom: ${smtpConfig.auth.user}\nTo: ${testEmail}`,
};

try {
  console.log(`Sending test email to: ${testEmail}...`);
  const info = await transporter.sendMail(testEmailContent);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ SUCCESS!');
  console.log('='.repeat(60));
  console.log(`\nEmail sent successfully!`);
  console.log(`  Message ID: ${info.messageId}`);
  console.log(`  Response: ${info.response}`);
  console.log(`  To: ${testEmail}`);
  console.log(`\n📬 Please check your inbox (and spam folder) at: ${testEmail}`);
  console.log('\n' + '='.repeat(60) + '\n');
  
} catch (error) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ FAILED TO SEND EMAIL');
  console.error('='.repeat(60));
  console.error(`\nError details:`);
  console.error(`  Code: ${error.code}`);
  console.error(`  Command: ${error.command}`);
  console.error(`  Response: ${error.response}`);
  console.error(`  Message: ${error.message}\n`);
  
  console.log('💡 Troubleshooting:');
  console.log('  1. Verify SMTP credentials are correct');
  console.log('  2. For Gmail: Use App Password (not regular password)');
  console.log('  3. Check if email address is valid');
  console.log('  4. Verify firewall allows SMTP connections');
  console.log('  5. Check server logs for more details\n');
  
  process.exit(1);
}

// Step 5: Test with PDF Attachment (like booking tickets)
console.log('📎 Step 5: Testing Email with PDF Attachment\n');

try {
  // Create a simple test PDF buffer (simulating booking ticket)
  const testPdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF');
  
  const testEmailWithPdf = {
    from: `"Bookati Test" <${smtpConfig.auth.user}>`,
    to: testEmail,
    subject: 'Bookati Email Test - With PDF Attachment',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">✅ Email with PDF Attachment Test</h2>
        <p>This email includes a PDF attachment to test booking ticket functionality.</p>
        <p>If you can see and open the attached PDF, email integration is fully working! ✅</p>
      </div>
    `,
    attachments: [{
      filename: 'test_ticket.pdf',
      content: testPdfContent,
      contentType: 'application/pdf',
    }],
  };
  
  console.log(`Sending test email with PDF attachment to: ${testEmail}...`);
  const info2 = await transporter.sendMail(testEmailWithPdf);
  
  console.log(`✅ Email with PDF sent successfully!`);
  console.log(`  Message ID: ${info2.messageId}`);
  console.log(`  Attachment: test_ticket.pdf (${(testPdfContent.length / 1024).toFixed(2)} KB)\n`);
  
} catch (error) {
  console.error(`❌ Failed to send email with PDF attachment:`);
  console.error(`  Error: ${error.message}\n`);
}

console.log('='.repeat(60));
console.log('  TEST COMPLETE');
console.log('='.repeat(60));
console.log('\n✅ Email integration is working correctly!');
console.log('📬 Check your inbox at:', testEmail);
console.log('   (Also check spam/junk folder if not found)\n');


