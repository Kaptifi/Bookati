/**
 * Apply tenant_zoho_configs table migration
 * 
 * This script applies the migration to create the tenant_zoho_configs table
 * for storing tenant-specific Zoho OAuth credentials.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1111@localhost:5432/saudi_towerdb',
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Applying tenant_zoho_configs migration...\n');

    // Read migration file
    const migrationPath = join(__dirname, '../../supabase/migrations/20250131000000_create_tenant_zoho_configs_table.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');

    // Execute the entire migration SQL as one block
    // This ensures proper order of execution
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
    console.log('\n📊 Verifying table exists...');
    
    // Verify table was created
    const verifyResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_zoho_configs'
      );
    `);
    
    if (verifyResult.rows[0].exists) {
      console.log('✅ Table tenant_zoho_configs exists!');
      
      // Check columns
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tenant_zoho_configs'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table columns:');
      columnsResult.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.error('❌ Table tenant_zoho_configs was not created!');
      process.exit(1);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration().catch(console.error);

