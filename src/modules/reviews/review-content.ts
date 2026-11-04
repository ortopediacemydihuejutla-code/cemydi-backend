import { BadRequestException } from '@nestjs/common';

// Content policy, not an XSS/SQL firewall. Consumers must still render plain text
// and keep Prisma parameterized; rejected content is never silently rewritten.
const blockedWords = [
  'puta',
  'puto',
  'putas',
  'putos',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejas',
  'cabron',
  'cabrona',
  'cabrones',
  'cabronas',
  'chingar',
  'chinga',
  'chingada',
  'chingado',
  'chingadas',
  'chingados',
  'chingon',
  'chingona',
  'chingones',
  'mierda',
  'mierdas',
  'joder',
  'jodido',
  'jodida',
  'coño',
  'pinche',
  'pinches',
  'culero',
  'culera',
  'culeros',
  'culeras',
  'verga',
  'vergas',
  'mamon',
  'mamona',
  'mamones',
  'gilipollas',
  'fuck',
  'fucking',
  'fucker',
  'shit',
  'bitch',
  'bitches',
  'asshole',
  'assholes',
  'chingas',
  'chingo',
  'chingue',
  'chingues',
  'chinguen',
  'chingadera',
  'chingaderas',
  'jodidos',
  'jodidas',
  'mamada',
  'mamadas',
  'maricon',
  'maricones',
  'imbecil',
  'imbeciles',
  'estupido',
  'estupida',
  'estupidos',
  'estupidas',
  'idiota',
  'idiotas',
  'carajo',
  'carajos',
];
const profanityPatterns = blockedWords.map(
  (word) =>
    new RegExp(
      `(?:^|[^a-z0-9])${word.split('').join('[\\W_]*')}(?=$|[^a-z0-9])`,
      'i',
    ),
);
const codePatterns = [
  /<\s*\/?\s*[a-z][^>]*>/i,
  /<\s*(?:script|iframe|svg|object|embed)\b/i,
  /<\?|<%/,
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*(?:text\/html|application\/(?:javascript|xhtml\+xml))/i,
  /\bon[a-z]+\s*=/i,
  /\b(?:eval|function|settimeout|setinterval)\s*\(/i,
  /\b(?:document|window)\s*\.\s*(?:cookie|location|write|eval)\b/i,
  /\b(?:drop|truncate|alter)\s+(?:table|database)\b/i,
  /\bunion\s+(?:all\s+)?select\b/i,
  /\b(?:delete\s+from|insert\s+into|update\s+\w+\s+set)\b/i,
  /['"]\s*(?:or|and)\s+\d+\s*=\s*\d+/i,
];

function inspectionText(value: string): string {
  let text = value.normalize('NFKC');
  // Bounded decoding is for inspection only, never evaluation or storage.
  for (let round = 0; round < 3; round += 1) {
    text = text
      .replace(/&#(x[\da-f]+|\d+);?/gi, (_, code: string) => {
        const point =
          code[0].toLowerCase() === 'x'
            ? parseInt(code.slice(1), 16)
            : Number(code);
        return point > 0 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : '';
      })
      .replace(
        /&(amp|lt|gt|quot|apos|colon|tab|newline);/gi,
        (_, name: string) =>
          ({
            amp: '&',
            lt: '<',
            gt: '>',
            quot: '"',
            apos: "'",
            colon: ':',
            tab: '\t',
            newline: '\n',
          })[name.toLowerCase()] ?? '',
      );
    try {
      text = decodeURIComponent(text);
    } catch {
      text = text.replace(/%([\da-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    }
  }
  return text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
}

export function validateReviewComment(value: string): string {
  const comment = value.trim();
  if (comment.length < 5 || comment.length > 500) {
    throw new BadRequestException('Escribe una opinión de 5 a 500 caracteres.');
  }
  const inspected = inspectionText(comment);
  if (inspected.trim().length < 5)
    throw new BadRequestException('Escribe una opinión de 5 a 500 caracteres.');
  // Reject control/bidi characters and markup/code attempts; normal punctuation,
  // apostrophes, accents, emoji and negative opinions remain valid plain text.
  const hasUnsafeControl = Array.from(inspected).some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });
  if (
    hasUnsafeControl ||
    codePatterns.some((pattern) => pattern.test(inspected))
  ) {
    throw new BadRequestException(
      'Escribe tu opinión como texto, sin HTML, scripts ni código.',
    );
  }
  const normalized = inspected
    .toLowerCase()
    .normalize('NFD')
    .replace(/n\u0303/g, 'ñ')
    .replace(/\p{M}/gu, '')
    .replace(
      /[4301!$57@]/g,
      (char) =>
        ({
          '4': 'a',
          '@': 'a',
          '3': 'e',
          '0': 'o',
          '1': 'i',
          '!': 'i',
          $: 's',
          '5': 's',
          '7': 't',
        })[char] ?? char,
    );
  if (profanityPatterns.some((pattern) => pattern.test(normalized))) {
    throw new BadRequestException(
      'Tu reseña contiene lenguaje ofensivo. Reformúlala sin groserías.',
    );
  }
  return comment;
}
