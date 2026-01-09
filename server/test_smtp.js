// Quick test script to verify SMTP configuration
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: './.env' });

console.log('\n📧 Testing SMTP Configuration...\n');
console.log('Environment Variables:');
console.log(`  SMTP_HOST: ${process.env.SMTP_HOST || 'NOT SET'}`);
console.log(`  SMTP_PORT: ${process.env.SMTP_PORT || 'NOT SET'}`);
console.log(`  SMTP_USER: ${process.env.SMTP_USER || 'NOT SET'}`);
console.log(`  SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? '***SET*** (' + process.env.SMTP_PASSWORD.length + ' chars)' : 'NOT SET'}`);
console.log('');

if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error('❌ SMTP credentials are missing!');
  console.error('   Please check your .env file.');
  process.exit(1);
}

try {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false, // For development/testing
    },
  });

  console.log('✅ SMTP transporter created successfully');
  console.log('\n📧 Testing connection...');
  
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ SMTP connection failed:');
      console.error('   Error:', error.message);
      console.error('   Code:', error.code);
      if (error.response) {
        console.error('   Response:', error.response);
      }
      process.exit(1);
    } else {
      console.log('✅ SMTP connection successful!');
      console.log('   Server is ready to send emails.');
      process.exit(0);
    }
  });
} catch (error) {
  console.error('❌ Failed to create transporter:', error.message);
  process.exit(1);
}

