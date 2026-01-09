/**
 * Verify Arabic Ticket Content
 * 
 * This script verifies that the generated PDF contains proper Arabic text
 * by extracting text from the PDF and checking for Arabic characters.
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function verifyArabicTicket() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 ========================================');
    console.log('🔍 Arabic Ticket Content Verification');
    console.log('🔍 ========================================\n');
    
    // Read the generated PDF
    const pdfPath = join(__dirname, 'test-arabic-ticket.pdf');
    const pdfBuffer = readFileSync(pdfPath);
    const pdfContent = pdfBuffer.toString('utf-8', 0, Math.min(pdfBuffer.length, 50000));
    
    console.log('📄 PDF File Analysis:');
    console.log(`   File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   File path: ${pdfPath}\n`);
    
    // Check for Noto Sans Arabic font embedding
    const hasNotoSansArabic = pdfContent.includes('NotoSansArabic');
    const hasTahoma = pdfContent.includes('Tahoma');
    const hasArial = pdfContent.includes('Arial');
    
    console.log('✅ Font Embedding Check:');
    console.log(`   Noto Sans Arabic: ${hasNotoSansArabic ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   Tahoma: ${hasTahoma ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   Arial: ${hasArial ? '✅ FOUND' : '❌ NOT FOUND'}\n`);
    
    if (!hasNotoSansArabic && !hasTahoma && !hasArial) {
      console.error('❌ No Arabic-capable font found in PDF!');
      console.error('   This means Arabic text will display incorrectly.\n');
    }
    
    // Check for Arabic Unicode characters
    // Arabic Unicode range: U+0600 to U+06FF
    const arabicCharPattern = /[\u0600-\u06FF]/g;
    const arabicMatches = pdfContent.match(arabicCharPattern);
    
    console.log('✅ Arabic Character Check:');
    if (arabicMatches && arabicMatches.length > 0) {
      console.log(`   Arabic characters found: ${arabicMatches.length}`);
      console.log(`   Sample characters: ${arabicMatches.slice(0, 20).join('')}`);
      console.log('   ✅ PDF contains Arabic text\n');
    } else {
      console.warn('   ⚠️  No Arabic Unicode characters detected in PDF');
      console.warn('   This might mean Arabic text was not included or is encoded differently\n');
    }
    
    // Check for specific Arabic words that should be in the ticket
    const arabicWords = {
      'تذكرة': 'Ticket',
      'الحجز': 'Booking',
      'التاريخ': 'Date',
      'الوقت': 'Time',
      'السعر': 'Price',
      'العميل': 'Customer',
      'ريال': 'SAR',
      'كبار': 'Adult',
    };
    
    console.log('✅ Expected Arabic Words Check:');
    let foundWords = 0;
    for (const [arabic, english] of Object.entries(arabicWords)) {
      const found = pdfContent.includes(arabic);
      if (found) {
        console.log(`   ✅ "${arabic}" (${english}): FOUND`);
        foundWords++;
      } else {
        console.log(`   ❌ "${arabic}" (${english}): NOT FOUND`);
      }
    }
    console.log(`\n   Summary: ${foundWords}/${Object.keys(arabicWords).length} expected words found\n`);
    
    // Get booking details from database
    const bookingResult = await client.query(`
      SELECT 
        b.id,
        b.customer_name,
        b.language,
        s.name as service_name_en,
        s.name_ar as service_name_ar,
        t.name as tenant_name_en,
        t.name_ar as tenant_name_ar,
        sl.slot_date,
        sl.start_time,
        sl.end_time
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN tenants t ON b.tenant_id = t.id
      JOIN slots sl ON b.slot_id = sl.id
      WHERE b.language = 'ar'
      ORDER BY b.created_at DESC
      LIMIT 1
    `);
    
    if (bookingResult.rows.length > 0) {
      const booking = bookingResult.rows[0];
      console.log('📋 Database Booking Details:');
      console.log(`   Booking ID: ${booking.id}`);
      console.log(`   Language: ${booking.language}`);
      console.log(`   Customer: ${booking.customer_name}`);
      console.log(`   Service (EN): ${booking.service_name_en}`);
      console.log(`   Service (AR): ${booking.service_name_ar || 'NOT SET'}`);
      console.log(`   Tenant (EN): ${booking.tenant_name_en}`);
      console.log(`   Tenant (AR): ${booking.tenant_name_ar || 'NOT SET'}`);
      console.log(`   Date: ${booking.slot_date}`);
      console.log(`   Time: ${booking.start_time} - ${booking.end_time}\n`);
      
      // Check if service name is in PDF
      if (booking.service_name_ar) {
        const serviceInPdf = pdfContent.includes(booking.service_name_ar);
        console.log(`✅ Service Name in PDF: ${serviceInPdf ? '✅ FOUND' : '❌ NOT FOUND'}`);
        if (serviceInPdf) {
          console.log(`   "${booking.service_name_ar}" is present in the PDF\n`);
        }
      }
    }
    
    // Final verdict
    console.log('🎫 ========================================');
    console.log('📊 FINAL VERDICT');
    console.log('🎫 ========================================\n');
    
    if (hasNotoSansArabic && foundWords >= 6) {
      console.log('✅ SUCCESS: Arabic ticket is properly generated!');
      console.log('   - Noto Sans Arabic font is embedded');
      console.log('   - Arabic text is present in PDF');
      console.log('   - Expected Arabic words found');
      console.log('\n   The ticket should display correctly with proper Arabic text.\n');
    } else if (hasNotoSansArabic && foundWords < 6) {
      console.log('⚠️  PARTIAL: Font is embedded but some Arabic text is missing');
      console.log('   - Check if Arabic text is available in database (service_name_ar, etc.)');
      console.log('   - Verify getText() function is using Arabic text correctly\n');
    } else {
      console.log('❌ FAILED: Arabic font not properly embedded');
      console.log('   - Font registration may have failed');
      console.log('   - Check server logs for font registration errors');
      console.log('   - Verify font file exists at: project/server/fonts/NotoSansArabic-Regular.ttf\n');
    }
    
    console.log('📝 Next Steps:');
    console.log('   1. Open test-arabic-ticket.pdf in a PDF viewer');
    console.log('   2. Verify Arabic text displays correctly (not garbled)');
    console.log('   3. Check text is right-to-left aligned');
    console.log('   4. If text is still garbled, restart the server and try again\n');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyArabicTicket().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

