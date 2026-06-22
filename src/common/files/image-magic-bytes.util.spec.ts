import {
  assertImageBufferMagicBytes,
  detectImageMimeFromBuffer,
} from './image-magic-bytes.util';

describe('image-magic-bytes.util', () => {
  it('detects png signature', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);

    expect(detectImageMimeFromBuffer(png)).toBe('image/png');
    expect(assertImageBufferMagicBytes(png)).toBe('image/png');
  });

  it('rejects non-image buffers', () => {
    expect(() => assertImageBufferMagicBytes(Buffer.from('hello'))).toThrow(
      'no es una imagen valida',
    );
  });
});
