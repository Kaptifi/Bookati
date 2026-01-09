import { query } from '../db';
import { logger } from '../utils/logger';

const CLEANUP_INTERVAL = 60000; // Run every 60 seconds
const LOCK_EXPIRY_SECONDS = 120; // 2 minutes

let cleanupInterval: NodeJS.Timeout | null = null;

export function startLockCleanup() {
  if (cleanupInterval) {
    return; // Already running
  }

  logger.info('Starting booking lock cleanup job', undefined, {
    interval: CLEANUP_INTERVAL,
    expirySeconds: LOCK_EXPIRY_SECONDS,
  });

  // Run immediately on start
  cleanupExpiredLocks();

  // Then run periodically
  cleanupInterval = setInterval(() => {
    cleanupExpiredLocks();
  }, CLEANUP_INTERVAL);
}

export function stopLockCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Stopped booking lock cleanup job');
  }
}

async function cleanupExpiredLocks() {
  try {
    const result = await query(
      `DELETE FROM booking_locks 
       WHERE lock_expires_at <= NOW() 
       RETURNING id, slot_id, reserved_by_session_id`,
      []
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Cleaned up expired booking locks', undefined, {
        count: result.rowCount,
        locks: result.rows,
      });
    }
  } catch (error: any) {
    logger.error('Error cleaning up expired locks', error);
  }
}



