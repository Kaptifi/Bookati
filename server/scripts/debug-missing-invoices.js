/**
 * Debug Missing Invoices
 * 
 * This script helps identify why newer invoices aren't showing up
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

async function debugMissingInvoices() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Debugging Missing Invoices...\n');

    // First, get a customer ID to test with
    const customerResult = await client.query(`
      SELECT customer_id, customer_name, customer_email
      FROM bookings
      WHERE zoho_invoice_id IS NOT NULL
      GROUP BY customer_id, customer_name, customer_email
      ORDER BY MAX(created_at) DESC
      LIMIT 1
    `);

    if (customerResult.rows.length === 0) {
      console.log('❌ No invoices found in database');
      return;
    }

    const customer = customerResult.rows[0];
    const customerId = customer.customer_id;
    
    console.log(`Testing with customer: ${customer.customer_name} (${customer.customer_email})`);
    console.log(`Customer ID: ${customerId}\n`);

    // Check ALL bookings for this customer (with and without invoices)
    const allBookings = await client.query(`
      SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.created_at,
        COALESCE(b.zoho_invoice_created_at, b.created_at) as sort_date
      FROM bookings b
      WHERE b.customer_id = $1
      ORDER BY b.created_at DESC
      LIMIT 20
    `, [customerId]);

    console.log(`\n📋 All bookings for this customer (last 20):`);
    allBookings.rows.forEach((row, i) => {
      const hasInvoice = !!row.zoho_invoice_id;
      const invoiceDate = row.zoho_invoice_created_at ? new Date(row.zoho_invoice_created_at) : null;
      const bookingDate = new Date(row.created_at);
      const sortDate = new Date(row.sort_date);
      
      console.log(`\n${i + 1}. Booking: ${row.id.substring(0, 8)}...`);
      console.log(`   Created: ${bookingDate.toLocaleString()}`);
      console.log(`   Has Invoice: ${hasInvoice ? '✅' : '❌'}`);
      if (hasInvoice) {
        console.log(`   Invoice ID: ${row.zoho_invoice_id}`);
        console.log(`   Invoice Date: ${invoiceDate ? invoiceDate.toLocaleString() : 'NULL'}`);
        console.log(`   Sort Date: ${sortDate.toLocaleString()}`);
      }
    });

    // Now check what the API query would return
    console.log(`\n\n📊 What the API query returns (with JOINs):`);
    const apiQuery = `
      SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.created_at,
        COALESCE(b.zoho_invoice_created_at, b.created_at) as sort_date,
        s.name as service_name,
        sl.slot_date
      FROM bookings b
      INNER JOIN services s ON b.service_id = s.id
      INNER JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
      ORDER BY COALESCE(b.zoho_invoice_created_at, b.created_at) DESC
      LIMIT 10
    `;

    const apiResult = await client.query(apiQuery, [customerId]);
    
    console.log(`Found ${apiResult.rows.length} invoices via API query:\n`);
    apiResult.rows.forEach((row, i) => {
      const invoiceDate = row.zoho_invoice_created_at ? new Date(row.zoho_invoice_created_at) : null;
      const bookingDate = new Date(row.created_at);
      const sortDate = new Date(row.sort_date);
      
      console.log(`${i + 1}. Invoice: ${row.zoho_invoice_id}`);
      console.log(`   Service: ${row.service_name}`);
      console.log(`   Booking Created: ${bookingDate.toLocaleString()}`);
      console.log(`   Invoice Created: ${invoiceDate ? invoiceDate.toLocaleString() : 'NULL'}`);
      console.log(`   Sort Date: ${sortDate.toLocaleString()}`);
    });

    // Check for bookings that have invoices but might be missing from API query
    console.log(`\n\n🔍 Checking for missing invoices (have zoho_invoice_id but missing from API query):`);
    const missingCheck = await client.query(`
      SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.created_at,
        b.service_id,
        b.slot_id,
        CASE WHEN s.id IS NULL THEN 'MISSING SERVICE' ELSE 'OK' END as service_status,
        CASE WHEN sl.id IS NULL THEN 'MISSING SLOT' ELSE 'OK' END as slot_status
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
        AND (s.id IS NULL OR sl.id IS NULL)
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [customerId]);

    if (missingCheck.rows.length > 0) {
      console.log(`\n⚠️  Found ${missingCheck.rows.length} invoices that might be missing due to JOIN issues:\n`);
      missingCheck.rows.forEach((row, i) => {
        console.log(`${i + 1}. Invoice: ${row.zoho_invoice_id}`);
        console.log(`   Service Status: ${row.service_status}`);
        console.log(`   Slot Status: ${row.slot_status}`);
        console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
      });
    } else {
      console.log(`✅ No missing invoices due to JOIN issues`);
    }

    // Check date cutoff
    const cutoffDate = new Date('2026-01-05T21:15:00');
    console.log(`\n\n📅 Checking invoices after ${cutoffDate.toLocaleString()}:`);
    const afterCutoff = await client.query(`
      SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.created_at,
        COALESCE(b.zoho_invoice_created_at, b.created_at) as sort_date
      FROM bookings b
      INNER JOIN services s ON b.service_id = s.id
      INNER JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
        AND COALESCE(b.zoho_invoice_created_at, b.created_at) > $2
      ORDER BY COALESCE(b.zoho_invoice_created_at, b.created_at) DESC
    `, [customerId, cutoffDate]);

    console.log(`Found ${afterCutoff.rows.length} invoices after cutoff date:\n`);
    afterCutoff.rows.forEach((row, i) => {
      const sortDate = new Date(row.sort_date);
      console.log(`${i + 1}. Invoice: ${row.zoho_invoice_id}, Date: ${sortDate.toLocaleString()}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

debugMissingInvoices();

