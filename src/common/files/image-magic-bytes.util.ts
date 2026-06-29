import { BadRequestException } from '@nestjs/common';

const ALLOWED_IMAGE_MIME_BY_SIGNATURE: Array<{
  mime: string;
  match: (buffer: Buffer) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    match: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    mime: 'image/png',
    match: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    match: (buffer) =>
      buffer.length >= 6 &&
      buffer.subarray(0, 3).toString('ascii') === 'GIF' &&
      (buffer[3] === 0x38 || buffer[3] === 0x39) &&
      buffer[4] === 0x61,
  },
  {
    mime: 'image/webp',
    match: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/avif',
    match: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
      (buffer.subarray(8, 12).toString('ascii') === 'avif' ||
        buffer.subarray(8, 12).toString('ascii') === 'avis'),
  },
];

export function detectImageMimeFromBuffer(buffer: Buffer): string | null {
  for (const candidate of ALLOWED_IMAGE_MIME_BY_SIGNATURE) {
    if (candidate.match(buffer)) {
      return candidate.mime;
    }
  }

  return null;
}

export function assertImageBufferMagicBytes(
  buffer: Buffer,
  fileLabel = 'archivo',
): string {
  const detectedMime = detectImageMimeFromBuffer(buffer);

  if (!detectedMime) {
    throw new BadRequestException(
      `El ${fileLabel} no es una imagen valida (JPEG, PNG, GIF, WEBP o AVIF)`,
    );
  }

  return detectedMime;
}

export function detectPdfMimeFromBuffer(buffer: Buffer): string | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return 'application/pdf';
  }

  return null;
}

export function assertPrescriptionDocumentMagicBytes(
  buffer: Buffer,
  fileLabel = 'archivo',
): string {
  const detectedMime =
    detectImageMimeFromBuffer(buffer) ?? detectPdfMimeFromBuffer(buffer);

  if (!detectedMime) {
    throw new BadRequestException(
      `El ${fileLabel} debe ser PDF o una imagen valida (JPEG, PNG, GIF, WEBP o AVIF)`,
    );
  }

  return detectedMime;
}
