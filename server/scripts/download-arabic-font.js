/**
 * Download Noto Sans Arabic font for PDF generation
 * This ensures Arabic text displays correctly in tickets
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf';
const FONT_DIR = join(__dirname, '../../fonts');
const FONT_PATH = join(FONT_DIR, 'NotoSansArabic-Regular.ttf');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        file.close();
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      } else {
        file.close();
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

async function downloadArabicFont() {
  try {
    console.log('📥 Downloading Noto Sans Arabic font...\n');
    
    // Create fonts directory if it doesn't exist
    if (!existsSync(FONT_DIR)) {
      await mkdir(FONT_DIR, { recursive: true });
      console.log(`✅ Created fonts directory: ${FONT_DIR}`);
    }
    
    // Check if font already exists
    if (existsSync(FONT_PATH)) {
      console.log(`✅ Font already exists: ${FONT_PATH}`);
      console.log('   Skipping download.\n');
      return;
    }
    
    console.log(`📥 Downloading from: ${FONT_URL}`);
    console.log(`📁 Saving to: ${FONT_PATH}\n`);
    
    await downloadFile(FONT_URL, FONT_PATH);
    
    console.log(`✅ Successfully downloaded Noto Sans Arabic font!`);
    console.log(`   Location: ${FONT_PATH}`);
    console.log(`\n✅ Arabic font is now available for PDF generation.`);
    console.log(`   Restart your server to use the new font.\n`);
    
  } catch (error) {
    console.error('❌ Error downloading font:', error.message);
    console.error('\n📋 Manual Installation:');
    console.error('   1. Visit: https://fonts.google.com/noto/specimen/Noto+Sans+Arabic');
    console.error('   2. Download "Noto Sans Arabic" font');
    console.error('   3. Extract and place NotoSansArabic-Regular.ttf in:');
    console.error(`      ${FONT_DIR}`);
    throw error;
  }
}

downloadArabicFont().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

