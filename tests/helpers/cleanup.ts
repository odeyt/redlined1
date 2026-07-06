/**
 * Test data cleanup helpers.
 * Test records are identified by the prefix "[TEST]" in their name/title.
 * Never deletes records without that prefix.
 */

import { Page } from '@playwright/test';

export const TEST_PREFIX = '[TEST]';
export const TEST_CUSTOMER_NAME = `${TEST_PREFIX} Auto Test Customer`;
export const TEST_VEHICLE_MAKE  = 'Toyota';
export const TEST_VEHICLE_MODEL = `${TEST_PREFIX} Test Model`;
export const TEST_JOB_COMPLAINT = `${TEST_PREFIX} Automated test complaint`;
export const TEST_ESTIMATE_NOTE = `${TEST_PREFIX} Automated estimate`;

/**
 * Cleanup is currently documented-only — deleting via UI is fragile.
 * The recommended approach is a nightly cleanup job that deletes all
 * records where name ILIKE '[TEST]%' from the staging database.
 *
 * SQL for staging Supabase cleanup (never run on production):
 *
 * DELETE FROM customers WHERE name ILIKE '[TEST]%';
 * DELETE FROM vehicles  WHERE model ILIKE '[TEST]%';
 * DELETE FROM job_cards WHERE complaint ILIKE '[TEST]%';
 * DELETE FROM estimates WHERE notes ILIKE '[TEST]%';
 */
export async function documentCleanupNeeded(page: Page, recordType: string, identifier: string): Promise<void> {
  console.log(`[cleanup] Test record created: ${recordType} — "${identifier}" — clean up after test run`);
}
