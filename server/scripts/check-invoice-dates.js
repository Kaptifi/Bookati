/**
 * Check Invoice Dates - Diagnostic Script
 * 
 * This script checks for invoices that might be missing from the billing page
 * Usage: node scripts/check-invoice-dates.js [customer_id]
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

async function checkInvoiceDates(customerId = null) {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Invoice Dates...\n');

    // Get all invoices with their dates
    let query = `
      SELECT 
        b.id,
        b.customer_id,
        b.customer_name,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.created_at,
        COALESCE(b.zoho_invoice_created_at, b.created_at) as sort_date
      FROM bookings b
      WHERE b.zoho_invoice_id IS NOT NULL
    `;
    
    const params = [];
    if (customerId) {
      query += ` AND b.customer_id = $1`;
      params.push(customerId);
    }
    
    query += ` ORDER BY COALESCE(b.zoho_invoice_created_at, b.created_at) DESC LIMIT 50`;

    const result = await client.query(query, params);

    console.log(`Found ${result.rows.length} invoices:\n`);

    result.rows.forEach((row, index) => {
      const invoiceDate = row.zoho_invoice_created_at 
        ? new Date(row.zoho_invoice_created_at)
        : null;
      const bookingDate = new Date(row.created_at);
      const sortDate = new Date(row.sort_date);

      console.log(`${index + 1}. Invoice ID: ${row.zoho_invoice_id}`);
      console.log(`   Customer: ${row.customer_name} (${row.customer_id.substring(0, 8)}...)`);
      console.log(`   Booking Created: ${bookingDate.toLocaleString()}`);
      console.log(`   Invoice Created: ${invoiceDate ? invoiceDate.toLocaleString() : 'NULL'}`);
      console.log(`   Sort Date: ${sortDate.toLocaleString()}`);
      
      if (!invoiceDate) {
        console.log(`   ⚠️  WARNING: zoho_invoice_created_at is NULL`);
      }
      
      // Check if after Jan 05, 2026 21:15
      const cutoffDate = new Date('2026-01-05T21:15:00');
      if (sortDate > cutoffDate) {
        console.log(`   ✅ This invoice is AFTER Jan 05, 2026 21:15`);
      }
      
      console.log('');
    });

    // Check for invoices with NULL zoho_invoice_created_at
    const nullCheckQuery = `
      SELECT COUNT(*) as count
      FROM bookings
      WHERE zoho_invoice_id IS NOT NULL
        AND zoho_invoice_created_at IS NULL
        ${customerId ? 'AND customer_id = $1' : ''}
    `;
    
    const nullResult = await customerId 
      ? await client.query(nullCheckQuery, [customerId])
      : await client.query(nullCheckQuery);
    
    console.log(`\n📊 Statistics:`);
    console.log(`   Invoices with NULL zoho_invoice_created_at: ${nullResult.rows[0].count}`);

    // Check date range
    const dateRangeQuery = `
      SELECT 
        MIN(COALESCE(zoho_invoice_created_at, created_at)) as earliest,
        MAX(COALESCE(zoho_invoice_created_at, created_at)) as latest
      FROM bookings
      WHERE zoho_invoice_id IS NOT NULL
        ${customerId ? 'AND customer_id = $1' : ''}
    `;
    
    const rangeResult = customerId
      ? await client.query(dateRangeQuery, [customerId])
      : await client.query(dateRangeQuery);
    
    if (rangeResult.rows[0].earliest) {
      console.log(`   Earliest invoice: ${new Date(rangeResult.rows[0].earliest).toLocaleString()}`);
      console.log(`   Latest invoice: ${new Date(rangeResult.rows[0].latest).toLocaleString()}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

const customerId = process.argv[2] || null;
checkInvoiceDates(customerId);

