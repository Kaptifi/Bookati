import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationsDir = join(__dirname, 'supabase', 'migrations');

async function applyMigrations() {
  try {
    // Get all migration files sorted
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      console.log(`\nApplying migration: ${file}`);
      const content = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        // Execute the SQL
        const { error } = await supabase.rpc('exec_sql', { sql_string: content });

        if (error) {
          console.error(`Error in ${file}:`, error);
          // Continue with next migration
        } else {
          console.log(`✓ ${file} applied successfully`);
        }
      } catch (err) {
        console.error(`Exception in ${file}:`, err.message);
        // Continue with next migration
      }
    }

    console.log('\n✅ All migrations processed');
  } catch (error) {
    console.error('Error applying migrations:', error);
    process.exit(1);
  }
}

applyMigrations();
