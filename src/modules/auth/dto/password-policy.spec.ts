import {
  isPasswordPolicyCompliant,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password-policy';

const VALID_PASSWORD = 'SecureP@ss1';

describe('password policy', () => {
  it('uses the same length bounds as the frontend contract', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(72);
  });

  it('accepts passwords with uppercase, digit and symbol', () => {
    expect(isPasswordPolicyCompliant(VALID_PASSWORD)).toBe(true);
  });

  it('rejects passwords shorter than 10 characters', () => {
    expect(isPasswordPolicyCompliant('Aa1!short')).toBe(false);
  });

  it('rejects passwords longer than 72 characters', () => {
    expect(isPasswordPolicyCompliant(`Aa1!${'x'.repeat(69)}`)).toBe(false);
  });

  it('rejects passwords without uppercase', () => {
    expect(isPasswordPolicyCompliant('securep@ss1')).toBe(false);
  });

  it('rejects passwords without digits', () => {
    expect(isPasswordPolicyCompliant('SecurePass!')).toBe(false);
  });

  it('rejects passwords without symbols', () => {
    expect(isPasswordPolicyCompliant('SecurePass1')).toBe(false);
  });

  it('matches the frontend policy contract', () => {
    const frontendRules = (password: string) => ({
      minLength: password.length >= PASSWORD_MIN_LENGTH,
      maxLength: password.length <= PASSWORD_MAX_LENGTH,
      hasUpper: /[A-Z]/.test(password),
      hasDigit: /\d/.test(password),
      hasSymbol: /[\W_]/.test(password),
    });

    const samples = [
      VALID_PASSWORD,
      'short1!',
      'nouppercase1!',
      'NOLOWERCASE1!',
      'NoDigitsHere!',
      'NoSymbols123',
    ];

    for (const sample of samples) {
      const rules = frontendRules(sample);
      const frontendValid =
        rules.minLength &&
        rules.maxLength &&
        rules.hasUpper &&
        rules.hasDigit &&
        rules.hasSymbol;

      expect(isPasswordPolicyCompliant(sample)).toBe(frontendValid);
    }
  });
});
