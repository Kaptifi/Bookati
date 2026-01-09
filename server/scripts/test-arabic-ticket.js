/**
 * Test Arabic Ticket Generation
 * 
 * This script tests that Arabic tickets are generated correctly with proper Arabic font.
 * It creates a test booking and generates a PDF ticket in Arabic.
 */

import { Pool } from 'pg';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function testArabicTicket() {
  const client = await pool.connect();
  
  try {
    console.log('🎫 ========================================');
    console.log('🎫 Arabic Ticket Generation Test');
    console.log('🎫 ========================================\n');
    
    // Step 1: Find or create a test booking with Arabic language
    console.log('📋 Step 1: Finding/Creating test booking...\n');
    
    // Try to find an existing booking with Arabic language
    let bookingResult = await client.query(`
      SELECT b.id, b.customer_name, b.language, s.name, s.name_ar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.language = 'ar'
      ORDER BY b.created_at DESC
      LIMIT 1
    `);
    
    let bookingId;
    
    if (bookingResult.rows.length > 0) {
      bookingId = bookingResult.rows[0].id;
      console.log(`✅ Found existing Arabic booking: ${bookingId}`);
      console.log(`   Customer: ${bookingResult.rows[0].customer_name}`);
      console.log(`   Service: ${bookingResult.rows[0].name_ar || bookingResult.rows[0].name}`);
      console.log(`   Language: ${bookingResult.rows[0].language}\n`);
    } else {
      // Find the most recent booking and update it to Arabic
      bookingResult = await client.query(`
        SELECT id, customer_name
        FROM bookings
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (bookingResult.rows.length === 0) {
        console.error('❌ No bookings found in database. Please create a booking first.');
        return;
      }
      
      bookingId = bookingResult.rows[0].id;
      
      // Update booking to Arabic
      await client.query(`
        UPDATE bookings 
        SET language = 'ar' 
        WHERE id = $1
      `, [bookingId]);
      
      console.log(`✅ Updated booking ${bookingId} to Arabic language`);
      console.log(`   Customer: ${bookingResult.rows[0].customer_name}\n`);
    }
    
    // Step 2: Import PDF service and generate ticket
    console.log('📄 Step 2: Generating Arabic PDF ticket...\n');
    
    const pdfService = await import('../src/services/pdfService.ts');
    
    console.log('   Calling generateBookingTicketPDFBase64...');
    const pdfBase64 = await pdfService.generateBookingTicketPDFBase64(bookingId, 'ar');
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      console.error('❌ Failed: PDF base64 is empty');
      return;
    }
    
    console.log(`✅ PDF generated successfully`);
    console.log(`   Base64 length: ${pdfBase64.length} characters`);
    
    // Step 3: Save PDF to file for inspection
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const outputPath = join(__dirname, 'test-arabic-ticket.pdf');
    writeFileSync(outputPath, pdfBuffer);
    
    console.log(`\n📁 PDF saved to: ${outputPath}`);
    console.log(`   File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB\n`);
    
    // Step 4: Verify Arabic text in booking
    const verifyResult = await client.query(`
      SELECT 
        b.id,
        b.customer_name,
        b.language,
        s.name as service_name_en,
        s.name_ar as service_name_ar,
        t.name as tenant_name_en,
        t.name_ar as tenant_name_ar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN tenants t ON b.tenant_id = t.id
      WHERE b.id = $1
    `, [bookingId]);
    
    if (verifyResult.rows.length > 0) {
      const booking = verifyResult.rows[0];
      console.log('📋 Booking Details:');
      console.log(`   Language: ${booking.language}`);
      console.log(`   Service (EN): ${booking.service_name_en}`);
      console.log(`   Service (AR): ${booking.service_name_ar || 'NOT SET'}`);
      console.log(`   Tenant (EN): ${booking.tenant_name_en}`);
      console.log(`   Tenant (AR): ${booking.tenant_name_ar || 'NOT SET'}\n`);
    }
    
    // Step 5: Verification checklist
    console.log('🎫 ========================================');
    console.log('✅ Test Complete!');
    console.log('🎫 ========================================\n');
    
    console.log('📋 Verification Checklist:');
    console.log('   1. Open the PDF file: test-arabic-ticket.pdf');
    console.log('   2. Check if Arabic text is displayed correctly (not garbled)');
    console.log('   3. Verify text is right-to-left aligned');
    console.log('   4. Confirm all labels are in Arabic:');
    console.log('      - تذكرة الحجز (Booking Ticket)');
    console.log('      - تفاصيل الحدث (Event Details)');
    console.log('      - التاريخ والوقت (Date & Time)');
    console.log('      - نوع التذكرة (Ticket Type)');
    console.log('      - اسم العميل (Customer Name)');
    console.log('      - السعر (Price)');
    console.log('      - معلومات التذكرة (Ticket Information)\n');
    
    console.log('⚠️  If Arabic text appears garbled:');
    console.log('   - Check server logs for font registration messages');
    console.log('   - Ensure Noto Sans Arabic font was downloaded correctly');
    console.log('   - Verify font file size is > 100 KB\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testArabicTicket().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
