import {
  generateNumericAuthCode,
  hashAuthCode,
  PASSWORD_RESET_CODE_LENGTH,
  verifyAuthCode,
} from './auth-crypto.util';

describe('auth-crypto.util', () => {
  it('generates an 8-digit reset code', () => {
    const code = generateNumericAuthCode();

    expect(code).toHaveLength(PASSWORD_RESET_CODE_LENGTH);
    expect(/^\d{8}$/.test(code)).toBe(true);
  });

  it('hashes and verifies reset codes with bcrypt', async () => {
    const code = '12345678';
    const hash = await hashAuthCode(code);

    await expect(verifyAuthCode(code, hash)).resolves.toBe(true);
    await expect(verifyAuthCode('87654321', hash)).resolves.toBe(false);
  });
});
