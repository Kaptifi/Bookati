import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

// Extract connection details from Supabase URL
const dbUrl = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
const connectionString = `postgresql://postgres.${dbUrl}:${supabaseKey.substring(0, 32)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log('Attempting direct PostgreSQL connection...');

const client = new Client({
  host: `aws-0-us-east-1.pooler.supabase.com`,
  port: 6543,
  database: 'postgres',
  user: `postgres.${dbUrl}`,
  password: process.env.SUPABASE_DB_PASSWORD || supabaseKey,
});

const migrationsDir = join(__dirname, 'supabase', 'migrations');

async function applyMigrations() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected to database\n');

    // Get all migration files sorted
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const content = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        console.log(`Applying: ${file}`);
        await client.query(content);
        console.log(`✓ Success\n`);
        successCount++;
      } catch (err) {
        if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate'))) {
          console.log(`⊘ Skipped (already exists)\n`);
          skipCount++;
        } else {
          console.error(`✗ Error: ${err.message}\n`);
          errorCount++;
        }
      }
    }

    console.log('='.repeat(60));
    console.log(`Migration Summary:`);
    console.log(`  ✓ Applied: ${successCount}`);
    console.log(`  ⊘ Skipped: ${skipCount}`);
    console.log(`  ✗ Errors: ${errorCount}`);
    console.log(`  Total: ${files.length}`);
    console.log('='.repeat(60));

    await client.end();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

applyMigrations();
