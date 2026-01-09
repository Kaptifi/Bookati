import { query, pool } from '../db';
import { zohoService } from '../services/zohoService';

interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  payload: {
    booking_id: string;
    tenant_id: string;
    attempt: number;
  };
  attempts: number;
  created_at: Date;
}

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 60000; // 60 seconds

/**
 * Calculate exponential backoff delay
 */
function calculateDelay(attempt: number): number {
  const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
  return delay;
}

/**
 * Process a single Zoho receipt job
 */
async function processReceiptJob(job: QueueJob): Promise<{ success: boolean; error?: string }> {
  const { booking_id, tenant_id, attempt } = job.payload;

  console.log(`[ZohoReceiptWorker] Processing job ${job.id} for booking ${booking_id} (attempt ${attempt + 1}/${MAX_RETRIES})`);

  try {
    // Check if invoice already exists
    const bookingCheck = await query(
      `SELECT zoho_invoice_id, payment_status FROM bookings WHERE id = $1`,
      [booking_id]
    );

    if (bookingCheck.rows.length === 0) {
      throw new Error(`Booking ${booking_id} not found`);
    }

    const booking = bookingCheck.rows[0];

    // Skip if invoice already created
    if (booking.zoho_invoice_id) {
      console.log(`[ZohoReceiptWorker] Invoice already exists for booking ${booking_id}, marking job as completed`);
      await query(
        `UPDATE queue_jobs SET status = 'completed', completed_at = now() WHERE id = $1`,
        [job.id]
      );
      return { success: true };
    }

    // Skip if payment status is not paid
    if (booking.payment_status !== 'paid') {
      console.log(`[ZohoReceiptWorker] Booking ${booking_id} payment status is ${booking.payment_status}, skipping`);
      await query(
        `UPDATE queue_jobs SET status = 'failed', completed_at = now() WHERE id = $1`,
        [job.id]
      );
      return { success: false, error: `Payment status is ${booking.payment_status}, not paid` };
    }

    // Generate receipt
    const result = await zohoService.generateReceipt(booking_id);

    if (result.success) {
      // Mark job as completed
      await query(
        `UPDATE queue_jobs 
         SET status = 'completed', completed_at = now() 
         WHERE id = $1`,
        [job.id]
      );
      console.log(`[ZohoReceiptWorker] ✅ Successfully generated receipt for booking ${booking_id}`);
      return { success: true };
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error: any) {
    console.error(`[ZohoReceiptWorker] Error processing job ${job.id}:`, error.message);

    const nextAttempt = attempt + 1;

    if (nextAttempt >= MAX_RETRIES) {
      // Max retries reached, mark as failed
      await query(
        `UPDATE queue_jobs 
         SET status = 'failed', completed_at = now() 
         WHERE id = $1`,
        [job.id]
      );
      console.error(`[ZohoReceiptWorker] ❌ Job ${job.id} failed after ${MAX_RETRIES} attempts`);
      return { success: false, error: error.message };
    } else {
      // Schedule retry with exponential backoff
      const delay = calculateDelay(nextAttempt);
      const retryAt = new Date(Date.now() + delay);

      await query(
        `UPDATE queue_jobs 
         SET status = 'pending', attempts = $1, payload = jsonb_set(payload, '{attempt}', $2::text::jsonb)
         WHERE id = $3`,
        [nextAttempt, nextAttempt, job.id]
      );

      console.log(`[ZohoReceiptWorker] ⏳ Scheduling retry ${nextAttempt + 1}/${MAX_RETRIES} for job ${job.id} in ${delay}ms`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Process pending Zoho receipt jobs
 */
export async function processZohoReceiptJobs(): Promise<void> {
  const client = await pool.connect();
  try {
    // Get pending jobs that are ready to process (not recently started)
    const jobsResult = await client.query(
      `SELECT * FROM queue_jobs 
       WHERE job_type = 'zoho_receipt' 
       AND status = 'pending'
       AND (started_at IS NULL OR started_at < now() - interval '5 minutes')
       ORDER BY created_at ASC
       LIMIT 10`,
      []
    );

    const jobs: QueueJob[] = jobsResult.rows;

    if (jobs.length === 0) {
      return; // No jobs to process
    }

    console.log(`[ZohoReceiptWorker] Found ${jobs.length} pending Zoho receipt jobs`);

    // Process jobs in parallel (but limit concurrency)
    const processingPromises = jobs.map(async (job) => {
      // Mark as processing
      await client.query(
        `UPDATE queue_jobs SET status = 'processing', started_at = now() WHERE id = $1`,
        [job.id]
      );

      // Process the job
      return processReceiptJob(job);
    });

    await Promise.allSettled(processingPromises);
  } catch (error: any) {
    console.error('[ZohoReceiptWorker] Error processing jobs:', error);
  } finally {
    client.release();
  }
}

/**
 * Start the Zoho receipt worker
 * This should be called periodically (e.g., every 30 seconds)
 */
export function startZohoReceiptWorker(intervalMs: number = 30000): NodeJS.Timeout {
  console.log(`[ZohoReceiptWorker] Starting worker with ${intervalMs}ms interval`);

  // Process immediately on start
  processZohoReceiptJobs().catch(console.error);

  // Then process periodically
  return setInterval(() => {
    processZohoReceiptJobs().catch(console.error);
  }, intervalMs);
}

/**
 * Stop the Zoho receipt worker
 */
export function stopZohoReceiptWorker(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  console.log('[ZohoReceiptWorker] Worker stopped');
}

