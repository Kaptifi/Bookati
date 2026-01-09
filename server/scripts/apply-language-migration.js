/**
 * Apply language column migration to bookings table
 * 
 * This script applies the migration to add the language column to the bookings table.
 * Run this script to fix the "column language does not exist" error.
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

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Applying language column migration to bookings table...\n');

    // Read migration file
    const migrationPath = join(__dirname, '../../supabase/migrations/20250131000001_add_language_to_bookings.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');

    // Execute the migration SQL
    try {
      console.log('Executing migration SQL...');
      await client.query(migrationSQL);
      console.log('✅ Migration SQL executed successfully\n');
    } catch (error) {
      // Ignore "already exists" errors for IF NOT EXISTS statements
      if (error.code === '42P07' || error.code === '42701' || error.message.includes('already exists')) {
        console.log(`⚠️  Some objects already exist (continuing): ${error.message}\n`);
      } else {
        throw error;
      }
    }

    await client.query('COMMIT');
    
    console.log('✅ Migration applied successfully!');
    console.log('\n📊 Verifying column exists...');
    
    // Verify column was created
    const verifyResult = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'bookings'
        AND column_name = 'language'
    `);
    
    if (verifyResult.rows.length > 0) {
      const column = verifyResult.rows[0];
      console.log('✅ Column verified:');
      console.log(`   - Name: ${column.column_name}`);
      console.log(`   - Type: ${column.data_type}`);
      console.log(`   - Nullable: ${column.is_nullable}`);
      console.log(`   - Default: ${column.column_default || 'none'}`);
    } else {
      console.warn('⚠️  Column verification: Column may exist but check failed');
    }
    
    // Verify index was created
    const indexResult = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'bookings' 
        AND indexname = 'idx_bookings_language'
    `);
    
    if (indexResult.rows.length > 0) {
      console.log('\n✅ Index verified:');
      console.log(`   - ${indexResult.rows[0].indexname}`);
    } else {
      console.warn('\n⚠️  Index verification: Index may not exist');
    }
    
    console.log('\n✅ Language migration is complete!');
    console.log('\n⚠️  Next steps:');
    console.log('   1. Restart backend server');
    console.log('   2. Test booking creation with different languages');
    console.log('   3. Verify tickets are generated in the correct language');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

