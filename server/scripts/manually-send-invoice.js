import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

const bookingId = process.argv[2] || '3bd1b8f1-cd6e-4a60-b336-71a8d3cb9bcc';

async function manuallySendInvoice() {
  const client = await pool.connect();
  try {
    console.log('📤 Manually Sending Invoice\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);

    // Get booking details
    const bookingResult = await client.query(
      `SELECT 
        id,
        customer_name,
        customer_email,
        customer_phone,
        tenant_id,
        zoho_invoice_id
      FROM bookings
      WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      console.log('❌ Booking not found');
      return;
    }

    const booking = bookingResult.rows[0];

    if (!booking.zoho_invoice_id) {
      console.log('❌ Invoice not created for this booking');
      console.log('   Run: node scripts/create-invoice-direct-service.js');
      return;
    }

    console.log('📋 Booking Details:');
    console.log(`   Customer: ${booking.customer_name}`);
    console.log(`   Email: ${booking.customer_email || 'NOT PROVIDED'}`);
    console.log(`   Phone: ${booking.customer_phone || 'NOT PROVIDED'}`);
    console.log(`   Invoice ID: ${booking.zoho_invoice_id}`);
    console.log('');

    // Use tsx to run TypeScript code
    console.log('🚀 Triggering invoice delivery via API...\n');
    
    // Call the generateReceipt again - it should skip creation but attempt delivery
    // Actually, let's check if we can call the service methods directly via tsx
    const scriptContent = `
import { zohoService } from './src/services/zohoService.js';

async function sendInvoice() {
  try {
    const bookingId = '${bookingId}';
    console.log('📋 Re-running generateReceipt to trigger delivery...');
    const result = await zohoService.generateReceipt(bookingId);
    if (result.success) {
      console.log('✅ Invoice delivery triggered');
    } else {
      console.log('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

sendInvoice();
`;

    // Write temp script
    const fs = await import('fs');
    const tempScript = join(__dirname, 'temp-send-invoice.mjs');
    fs.writeFileSync(tempScript, scriptContent);

    try {
      // Run with tsx
      const { stdout, stderr } = await execAsync(`npx tsx ${tempScript}`, {
        cwd: join(__dirname, '..'),
        env: { ...process.env }
      });
      
      console.log(stdout);
      if (stderr) {
        console.error('Warnings:', stderr);
      }
    } catch (error) {
      console.error('❌ Error running script:', error.message);
      if (error.stdout) console.log('Output:', error.stdout);
      if (error.stderr) console.error('Error:', error.stderr);
    } finally {
      // Clean up
      try {
        fs.unlinkSync(tempScript);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

manuallySendInvoice();

