import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  
  // CRITICAL: Log params before sending to PostgreSQL to catch "NULL" strings
  if (params && params.length > 0) {
    console.log('[db.query] ========================================');
    console.log('[db.query] SQL:', text);
    console.log('[db.query] Params count:', params.length);
    console.log('[db.query] Params details:');
    params.forEach((p, i) => {
      const isStringNULL = p === 'NULL' || p === 'null' || (typeof p === 'string' && String(p).trim().toUpperCase() === 'NULL');
      console.log(`[db.query]   $${i + 1}: ${JSON.stringify(p)} (type: ${typeof p}, isNull: ${p === null}, isStringNULL: ${isStringNULL})`);
      if (isStringNULL) {
        console.error(`[db.query] ⚠️⚠️⚠️ CRITICAL: Param $${i + 1} is string "NULL"! This will cause PostgreSQL error!`);
      }
    });
    console.log('[db.query] ========================================');
  }
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error('[db.query] Query error', { text, duration, error: error.message, code: error.code });
    if (params && params.length > 0) {
      console.error('[db.query] Params that caused error:', params.map((p, i) => `$${i + 1} = ${JSON.stringify(p)} (${typeof p})`).join(', '));
    }
    throw error;
  }
}

// Test database connection
pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});



