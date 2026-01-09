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

const bookingId = process.argv[2] || '3bd1b8f1-cd6e-4a60-b336-71a8d3cb9bcc';

async function manuallySendInvoice() {
  try {
    console.log('📤 Manually Triggering Invoice Delivery\n');
    console.log('='.repeat(60));
    console.log(`Booking ID: ${bookingId}\n`);

    // Use the API to trigger invoice generation/delivery
    const fetch = (await import('node-fetch')).default;
    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    console.log('🚀 Calling generateReceipt via API...\n');
    
    const response = await fetch(`${apiUrl}/api/zoho/test-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: '63107b06-938e-4ce6-b0f3-520a87db397b', // Default tenant
        booking_id: bookingId,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ API Response:');
      console.log(JSON.stringify(result, null, 2));
      console.log('');
      console.log('📋 Check server logs for delivery details:');
      console.log('   Look for: [ZohoService] 📧 Attempting to send invoice via email...');
      console.log('   Look for: [ZohoService] 📱 Step 2-3: Downloading invoice PDF...');
    } else {
      console.error('❌ API Error:');
      console.error(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Make sure the server is running on http://localhost:3001');
  } finally {
    await pool.end();
  }
}

manuallySendInvoice();

