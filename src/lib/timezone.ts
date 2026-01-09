import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

/**
 * Convert UTC timestamp to tenant's local timezone for display
 */
export function convertUTCToTenantTime(
  utcTimestamp: string | Date,
  tenantTimeZone: string = 'Asia/Riyadh'
): Date {
  const date = typeof utcTimestamp === 'string' ? parseISO(utcTimestamp) : utcTimestamp;
  return toZonedTime(date, tenantTimeZone);
}

/**
 * Convert tenant's local time to UTC for storage
 */
export function convertTenantTimeToUTC(
  localTimestamp: string | Date,
  tenantTimeZone: string = 'Asia/Riyadh'
): Date {
  const date = typeof localTimestamp === 'string' ? parseISO(localTimestamp) : localTimestamp;
  return fromZonedTime(date, tenantTimeZone);
}

/**
 * Format date in tenant's timezone
 */
export function formatInTenantTimeZone(
  date: string | Date,
  formatString: string,
  tenantTimeZone: string = 'Asia/Riyadh'
): string {
  const zonedDate = convertUTCToTenantTime(date, tenantTimeZone);
  return format(zonedDate, formatString, { timeZone: tenantTimeZone });
}

/**
 * Get current time in tenant's timezone
 */
export function getCurrentTimeInTenantZone(tenantTimeZone: string = 'Asia/Riyadh'): Date {
  return toZonedTime(new Date(), tenantTimeZone);
}

/**
 * Check if a date is in the past (in tenant's timezone)
 */
export function isDateInPast(date: string | Date, tenantTimeZone: string = 'Asia/Riyadh'): boolean {
  const zonedDate = convertUTCToTenantTime(date, tenantTimeZone);
  const now = getCurrentTimeInTenantZone(tenantTimeZone);
  return zonedDate < now;
}
