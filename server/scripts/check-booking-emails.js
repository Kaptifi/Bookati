#!/usr/bin/env node

/**
 * Check Booking Emails Script
 * 
 * This script checks recent bookings and verifies if emails were sent
 * 
 * Usage: node scripts/check-booking-emails.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkBookingEmails() {
  console.log('\n' + '='.repeat(60));
  console.log('  CHECKING RECENT BOOKINGS FOR EMAIL ISSUES');
  console.log('='.repeat(60) + '\n');
  
  const client = await pool.connect();
  
  try {
    // Get recent bookings (last 10)
    const result = await client.query(`
      SELECT 
        b.id,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.status,
        b.created_at,
        s.name as service_name,
        t.name as tenant_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN tenants t ON b.tenant_id = t.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('No bookings found.\n');
      return;
    }

    console.log(`Found ${result.rows.length} recent booking(s):\n`);

    for (const booking of result.rows) {
      console.log(`Booking ID: ${booking.id}`);
      console.log(`  Customer: ${booking.customer_name}`);
      console.log(`  Email: ${booking.customer_email || '❌ NOT PROVIDED'}`);
      console.log(`  Phone: ${booking.customer_phone || '❌ NOT PROVIDED'}`);
      console.log(`  Service: ${booking.service_name}`);
      console.log(`  Tenant: ${booking.tenant_name}`);
      console.log(`  Status: ${booking.status}`);
      console.log(`  Created: ${new Date(booking.created_at).toLocaleString()}`);
      
      // Check if email is valid
      if (!booking.customer_email) {
        console.log(`  ⚠️  WARNING: No email address provided - email cannot be sent`);
      } else if (!booking.customer_email.includes('@')) {
        console.log(`  ⚠️  WARNING: Invalid email format - ${booking.customer_email}`);
      } else {
        console.log(`  ✅ Email address looks valid`);
      }
      
      console.log('');
    }

    // Summary
    const bookingsWithEmail = result.rows.filter(b => b.customer_email && b.customer_email.includes('@'));
    const bookingsWithoutEmail = result.rows.length - bookingsWithEmail.length;

    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total bookings checked: ${result.rows.length}`);
    console.log(`Bookings with valid email: ${bookingsWithEmail.length} ✅`);
    console.log(`Bookings without email: ${bookingsWithoutEmail} ${bookingsWithoutEmail > 0 ? '⚠️' : ''}`);
    console.log('='.repeat(60) + '\n');

    if (bookingsWithoutEmail > 0) {
      console.log('💡 RECOMMENDATION:');
      console.log('   When creating bookings via reception, make sure to provide a valid customer email address.');
      console.log('   The email field is required for sending booking tickets.\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBookingEmails();


