export function buildManifestXml(fileName) {
  const safe = String(fileName).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<UnisonCaptureManifest Version="2.0" xmlns="http://schemas.panopto.com/unison/capture/2.0">
  <CaptureName>Uploaded Session</CaptureName>
  <CaptureStart>${now}</CaptureStart>
  <Streams>
    <Stream>
      <Name>Primary Video</Name>
      <Type>Video</Type>
      <RelativeStart>00:00:00</RelativeStart>
      <RelativeEnd>00:00:00</RelativeEnd>
      <Filename>${safe}</Filename>
      <Language/>
    </Stream>
  </Streams>
</UnisonCaptureManifest>`;
}
