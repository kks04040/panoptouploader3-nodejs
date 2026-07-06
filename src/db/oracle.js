import oracledb from 'oracledb';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let pool = null;

export async function initPool() {
  if (pool) return pool;
  logger.info('Initializing Oracle connection pool (thin mode)...');
  pool = await oracledb.createPool({
    user: config.db.user,
    password: config.db.password,
    connectString: config.db.connectString,
    poolMin: config.db.poolMin,
    poolMax: config.db.poolMax,
    poolIncrement: config.db.poolIncrement,
    poolTimeout: 60,
  });
  logger.info('Oracle pool created.');
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.close(0);
    pool = null;
    logger.info('Oracle pool closed.');
  }
}

export async function getConnection() {
  if (!pool) await initPool();
  return pool.getConnection();
}

export { oracledb };
