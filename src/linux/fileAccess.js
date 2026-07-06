import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let SftpClient = null;

async function loadSftp() {
  if (SftpClient) return SftpClient;
  const mod = await import('ssh2-sftp-client');
  SftpClient = mod.default || mod;
  return SftpClient;
}

function resolveLocalPath(sourcePath) {
  const root = config.linux.sourceRootPath;
  if (!root) return sourcePath;
  if (path.isAbsolute(sourcePath) && sourcePath.toLowerCase().startsWith(root.toLowerCase())) {
    return sourcePath;
  }
  const cleaned = sourcePath.replace(/^[/\\]+/, '');
  return path.join(root, cleaned);
}

function resolveRemotePath(sourcePath) {
  return sourcePath;
}

export async function openSource(sourcePath) {
  if (config.linux.accessMode === 'SFTP') {
    return openSftp(sourcePath);
  }
  return openLocal(sourcePath);
}

async function openLocal(sourcePath) {
  const localPath = resolveLocalPath(sourcePath);
  const stat = fs.statSync(localPath);
  logger.debug('Opening local source', { localPath, size: stat.size });
  return {
    size: stat.size,
    contentLength: stat.size,
    streamProvider: async () => fs.createReadStream(localPath, { highWaterMark: config.upload.chunkSizeMb * 1024 * 1024 }),
    close: async () => {},
  };
}

async function openSftp(sourcePath) {
  const Sftp = await loadSftp();
  const sftp = new Sftp();
  const cfg = {
    host: config.linux.sftp.host,
    port: config.linux.sftp.port,
    username: config.linux.sftp.user,
  };
  if (config.linux.sftp.privateKeyPath) {
    cfg.privateKey = fs.readFileSync(config.linux.sftp.privateKeyPath);
  } else {
    cfg.password = config.linux.sftp.password;
  }
  await sftp.connect(cfg);
  const remotePath = resolveRemotePath(sourcePath);
  const stat = await sftp.stat(remotePath);
  logger.debug('Opening SFTP source', { remotePath, size: stat.size });
  let openStream = null;
  return {
    size: stat.size,
    contentLength: stat.size,
    streamProvider: async () => {
      if (openStream) openStream.destroy();
      openStream = sftp.createReadStream(remotePath, { highWaterMark: config.upload.chunkSizeMb * 1024 * 1024 });
      return openStream;
    },
    close: async () => {
      try {
        if (openStream) openStream.destroy();
      } catch {}
      try {
        await sftp.end();
      } catch {}
    },
  };
}
