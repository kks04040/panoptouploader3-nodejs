import config from './config/index.js';
import logger from './utils/logger.js';
import { initPool, closePool } from './db/oracle.js';
import * as repo from './db/migrationRepository.js';
import { processMigration } from './orchestrator.js';
import { sleep, MigrationError } from './utils/index.js';

let shuttingDown = false;
const loopIntervalMs = config.upload.loopIntervalSec * 1000;

async function runOnce() {
  const reclaimed = await repo.reclaimStuckRows(config.upload.stuckReclaimSeconds).catch((e) => {
    logger.warn('reclaimStuckRows failed', { err: e.message });
    return 0;
  });
  if (reclaimed) logger.info('Reclaimed stuck rows', { count: reclaimed });

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
  // 원자적 클레임: 다른 인스턴스가 같은 행을 동시에 처리하지 못하게 PENDING -> FOLDER_CREATING 전환
  const claimed = await repo.claimRow(row.migration_id).catch((e) => {
    logger.error('Failed to claim row', { migrationId: row.migration_id, err: e.message });
    return false;
  });
  if (!claimed) {
    logger.debug('Row already claimed by another instance, skipping', { migrationId: row.migration_id });
    return;
  }
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
    await repo.markFailed(row.migration_id, err.message, retryable).catch((e) =>
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
