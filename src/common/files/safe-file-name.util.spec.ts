import { sanitizeFileName } from './safe-file-name.util';

describe('safe-file-name.util', () => {
  it('sanitizes special characters and control regex chars from filename', () => {
    const raw = 'receta_\u0000\u001f<script>:document.pdf';
    const result = sanitizeFileName(raw);
    expect(result).toBe('receta_-script-document.pdf');
  });

  it('handles reserved Windows file names', () => {
    expect(sanitizeFileName('con.txt')).toBe('archivo-con.txt');
    expect(sanitizeFileName('NUL.pdf')).toBe('archivo-NUL.pdf');
    expect(sanitizeFileName('COM1.png')).toBe('archivo-COM1.png');
  });

  it('uses custom fallback if result is empty or invalid', () => {
    expect(sanitizeFileName('', 'documento')).toBe('documento');
  });

  it('truncates extremely long file names to 120 characters', () => {
    const longName = 'a'.repeat(200) + '.pdf';
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(120);
  });
});
