const RESERVED_WINDOWS_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export function sanitizeFileName(fileName: string, fallback = 'archivo') {
  const normalized = fileName
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>:|?*\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);

  const safeName = normalized || fallback;
  const baseName = safeName.split('.')[0]?.toLowerCase();

  if (baseName && RESERVED_WINDOWS_NAMES.has(baseName)) {
    return `${fallback}-${safeName}`;
  }

  return safeName;
}
