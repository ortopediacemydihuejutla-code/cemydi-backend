import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { validateReviewComment } from './review-content';
import { CreateReviewDto } from './dto/create-review.dto';

describe('Review content policy', () => {
  it.each([
    'Buen producto, envío rápido. ¡Gracias!',
    'El servicio fue malo y el equipo llegó roto.',
    "O'Connor me atendió; precio < 200 y 10% de descuento.",
    'La computadora funciona bien, necesito una silla.',
    'El cono de apoyo es útil.',
  ])('permite texto y críticas sin interpretarlos: %s', (comment) => {
    expect(validateReviewComment(`  ${comment}  `)).toBe(comment);
  });
  it.each([
    'Eres un pendejo',
    'Esto es una MIERDA',
    'p.u.t.o servicio',
    'p u t a atención',
    'Servicio p3nd3j0',
    'Servicio p\u200but0',
    'Qué CABRÓN',
    'Son unos imbéciles',
    'No me chingues',
    'Son unos idiotas',
    'Esto es un coño',
    'fucking terrible',
  ])('rechaza groserías: %s', (comment) => {
    expect(() => validateReviewComment(comment)).toThrow('lenguaje ofensivo');
  });
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '%3Cscript%3Ealert(1)%3C/script%3E',
    '&amp;lt;script&amp;gt;alert(1)',
    '&#x3c;iframe src=x&#x3e;',
    'javascript:alert(1)',
    'java\u200bscript:alert(1)',
    'eval("alert(1)")',
    "'; DROP TABLE reviews; --",
    'UNION SELECT password FROM users',
    'DELETE FROM reviews;',
    'texto\u0000oculto',
  ])('rechaza código/controles: %s', (comment) => {
    expect(() => validateReviewComment(comment)).toThrow(
      'sin HTML, scripts ni código',
    );
  });
  it.each(['     ', 'corto'.slice(0, 4), 'a'.repeat(501)])(
    'rechaza longitud inválida',
    (comment) => {
      expect(() => validateReviewComment(comment)).toThrow('5 a 500');
    },
  );
  it('valida espacios y rating en el DTO antes de persistir', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      productId: 1,
      rating: 6,
      comment: '       ',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['rating', 'comment']),
    );
  });
});
