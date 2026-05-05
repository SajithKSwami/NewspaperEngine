import cron from 'node-cron';
import { runIngestion } from './pipeline.ts';

// Runs the full ingestion pipeline on a cron schedule.
// Default: every 2 hours. Adjust INGEST_CRON env var to change.
export function startScheduler(cronExpression = '0 */2 * * *'): void {
  const expression = process.env.INGEST_CRON ?? cronExpression;

  // Run once immediately on startup so the DB isn't empty on first boot.
  runIngestion().catch(err => console.error('[Scheduler] Initial ingest failed:', err));

  cron.schedule(expression, () => {
    console.log(`[Scheduler] Running scheduled ingest at ${new Date().toISOString()}`);
    runIngestion().catch(err => console.error('[Scheduler] Scheduled ingest failed:', err));
  });

  console.log(`[Scheduler] Ingestion scheduled: ${expression}`);
}
