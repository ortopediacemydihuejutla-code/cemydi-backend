function normalizeClassificationName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

export function areEquivalentClassifications(a: string, b: string) {
  const normalizedA = normalizeClassificationName(a);
  const normalizedB = normalizeClassificationName(b);

  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  if (Math.abs(normalizedA.length - normalizedB.length) > 2) return false;

  return levenshteinDistance(normalizedA, normalizedB) <= 1;
}

export function canonicalizeClassification(value: string) {
  const trimmed = value.trim();
  const normalized = normalizeClassificationName(trimmed);

  if (
    normalized === 'equipomedico' ||
    normalized === 'equipomdico' ||
    (normalized.startsWith('equipo m') && normalized.endsWith('dico'))
  ) {
    return 'Equipo Medico';
  }

  return trimmed.replace(/\uFFFD/g, '');
}
