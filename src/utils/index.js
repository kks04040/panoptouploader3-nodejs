export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MigrationError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'MigrationError';
    this.retryable = retryable;
  }
}

export function truncate(str, len = 4000) {
  if (!str) return null;
  return str.length > len ? str.slice(0, len) : str;
}

export function withMigrationLog(migrationId, childLogger) {
  return childLogger.child({ migrationId });
}
