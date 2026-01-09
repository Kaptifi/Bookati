import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db';
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
  startLockCleanup();
  logger.info('Background jobs started', undefined, { job: 'lockCleanup' });
  
  // Start Zoho receipt worker (processes every 30 seconds)
  const zohoWorkerInterval = process.env.ZOHO_WORKER_INTERVAL 
    ? parseInt(process.env.ZOHO_WORKER_INTERVAL) 
    : 30000;
  startZohoReceiptWorker(zohoWorkerInterval);
  logger.info('Background jobs started', undefined, { job: 'zohoReceiptWorker' });
});
