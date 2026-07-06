import axios from 'axios';
import logger from '../utils/logger.js';
import { buildManifestXml } from './manifest.js';

export async function uploadMediaFile(uploadTarget, fileName, streamProvider, contentLength) {
  const manifestXml = buildManifestXml(fileName);
  const manifestUrl = `${uploadTarget}/manifest.xml`;
  const mediaUrl = `${uploadTarget}/${encodeURIComponent(fileName)}`;

  logger.info('Uploading session manifest', { manifestUrl });
  await axios.put(manifestUrl, manifestXml, {
    headers: { 'Content-Type': 'application/xml' },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 60000,
  });

  logger.info('Uploading media file', { mediaUrl, contentLength });
  const stream = await streamProvider();
  await axios.put(mediaUrl, stream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': contentLength,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 0,
  });
  logger.info('Media upload complete', { mediaUrl });
}
