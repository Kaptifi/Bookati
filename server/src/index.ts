import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, testConnection } from './db';
import { authRoutes } from './routes/auth';
import { queryRoutes } from './routes/query';
import { customerRoutes } from './routes/customers';
import { reviewRoutes } from './routes/reviews';
import { bookingRoutes } from './routes/bookings';
import { tenantRoutes } from './routes/tenants';
import { employeeRoutes } from './routes/employees';
import { zohoRoutes } from './routes/zoho';
import { startLockCleanup } from './jobs/cleanupLocks';
import { startZohoReceiptWorker } from './jobs/zohoReceiptWorker';
import { zohoCredentials } from './config/zohoCredentials';
import { logger } from './utils/logger';

dotenv.config();

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set in .env file');
  console.error('   Please create server/.env file with DATABASE_URL');
  console.error('   See server/.env.example for template');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - Allow all origins for development
// This fixes CORS issues with localhost and ngrok
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '250mb' })); // Increased payload limit to support 200MB file uploads for service providers and users
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

// Health check (both /health and /api/health for compatibility)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/zoho', zohoRoutes);
app.use('/api', queryRoutes);

// Error handler with logging
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const context = logger.extractContext(req);
  logger.error('Unhandled error', err, context, {
    statusCode: err.status || 500,
    body: req.body,
    query: req.query,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Global error handlers to prevent server crashes
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('⚠️  Unhandled Rejection at:', promise);
  console.error('⚠️  Reason:', reason);
  logger.error('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)));
  // Don't exit - log and continue
});

process.on('uncaughtException', (error: Error) => {
  console.error('⚠️  Uncaught Exception:', error.message);
  console.error('⚠️  Stack:', error.stack);
  logger.error('Uncaught Exception', error);
  // Don't exit - log and continue
});

// Start server with database connection validation
async function startServer() {
  console.log('🔍 Testing database connection...');

  // Try to connect to database with retries
  let connected = false;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`   Attempt ${attempt}/${maxRetries}...`);
    connected = await testConnection();

    if (connected) {
      break;
    }

    if (attempt < maxRetries) {
      console.log(`   Retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  if (!connected) {
    console.error('❌ Failed to connect to database after 3 attempts');
    console.error('   Please check your DATABASE_URL in server/.env');
    console.error('   Server will continue but database operations will fail');
  }

  app.listen(PORT, () => {
    logger.info('API Server started', undefined, {
      port: PORT,
      database: process.env.DATABASE_URL?.split('@')[1] || 'Not configured',
      environment: process.env.NODE_ENV || 'development',
    });
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}`);

    // Load and validate Zoho credentials at startup
    try {
      zohoCredentials.loadCredentials();
      console.log(`✅ Zoho credentials loaded successfully`);
    } catch (error: any) {
      console.warn(`⚠️  Zoho credentials not configured: ${error.message}`);
      console.warn(`   Zoho invoice features will not work until credentials are configured.`);
      console.warn(`   See server/ZOHO_CREDENTIALS_SETUP.md for setup instructions.`);
    }

    // Start background cleanup job for expired booking locks
    // Wrap in try-catch to prevent startup failure
    try {
      startLockCleanup();
      logger.info('Background jobs started', undefined, { job: 'lockCleanup' });
    } catch (error: any) {
      console.error('⚠️  Failed to start lock cleanup job:', error.message);
    }

    // Start Zoho receipt worker (processes every 30 seconds)
    // Wrap in try-catch to prevent startup failure
    try {
      const zohoWorkerInterval = process.env.ZOHO_WORKER_INTERVAL
        ? parseInt(process.env.ZOHO_WORKER_INTERVAL)
        : 30000;
      startZohoReceiptWorker(zohoWorkerInterval);
      logger.info('Background jobs started', undefined, { job: 'zohoReceiptWorker' });
    } catch (error: any) {
      console.error('⚠️  Failed to start Zoho receipt worker:', error.message);
    }
  });
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
