import config from './config/index.js';
import logger from './utils/logger.js';
import { initPool, closePool } from './db/oracle.js';
import * as repo from './db/migrationRepository.js';
import { processMigration } from './orchestrator.js';
import { sleep, MigrationError } from './utils/index.js';

let shuttingDown = false;
const loopIntervalMs = config.upload.loopIntervalSec * 1000;

async function runOnce() {
  logger.info('Fetching PENDING batch...', { batchSize: config.upload.batchSize });
  const rows = await repo.fetchPendingBatch(config.upload.batchSize);
  if (!rows.length) {
    logger.info('No PENDING rows.');
    return;
  }
  logger.info(`Processing ${rows.length} row(s).`);
  for (const row of rows) {
    if (shuttingDown) break;
    await handleRow(row);
  }
}

async function handleRow(row) {
  try {
    await processMigration(row);
  } catch (err) {
    const retryable = err instanceof MigrationError ? err.retryable : true;
    logger.error('Row failed', {
      migrationId: row.migration_id,
      err: err.message,
      retryable,
      stack: err.stack,
    });
    await repo.markFailed(row.migration_id, err.message).catch((e) =>
      logger.error('Failed to mark row as failed', { err: e.message })
    );
  }
}

async function main() {
  await initPool();
  logger.info('Panopto migrator started', { mode: config.isOnce ? 'once' : 'loop' });

  while (!shuttingDown) {
    try {
      await runOnce();
    } catch (err) {
      logger.error('Batch run error', { err: err.message, stack: err.stack });
    }
    if (config.isOnce) break;
    await sleep(loopIntervalMs);
  }

  await closePool();
  logger.info('Panopto migrator stopped.');
}

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down...`);
  shuttingDown = true;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  logger.error('Fatal error on startup', { err: err.message, stack: err.stack });
  process.exit(1);
});
