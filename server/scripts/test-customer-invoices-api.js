import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const customerEmail = process.argv[2] || 'kaptifidev@gmail.com';

async function testCustomerInvoicesAPI() {
  try {
    console.log('🧪 Testing Customer Invoices API Endpoint\n');
    console.log('='.repeat(60));
    console.log(`Customer Email: ${customerEmail}\n`);

    // Create a test JWT token for the customer
    // In real scenario, this would come from the login endpoint
    const token = jwt.sign(
      {
        id: 'ef0942bb-9fe9-4478-af17-ee2fb4ff1b56', // From test-customer-invoices.js
        email: customerEmail,
        role: 'customer',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('📋 Test Token Created');
    console.log(`   Token: ${token.substring(0, 50)}...\n`);

    // Test the API endpoint
    const API_URL = process.env.API_URL || 'http://localhost:3001/api';
    console.log(`🌐 Testing API: ${API_URL}/customers/invoices\n`);

    const response = await fetch(`${API_URL}/customers/invoices`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:');
      console.error(errorText);
      return;
    }

    const data = await response.json();
    console.log(`✅ Success! Received ${data.length} invoices\n`);

    if (data.length > 0) {
      console.log('📋 Sample Invoice (first one):');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('⚠️  No invoices returned');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testCustomerInvoicesAPI();

