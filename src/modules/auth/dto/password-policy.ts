export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;

export function isPasswordPolicyCompliant(value: string): boolean {
  if (
    value.length < PASSWORD_MIN_LENGTH ||
    value.length > PASSWORD_MAX_LENGTH
  ) {
    return false;
  }

  if (!/[A-Z]/.test(value)) {
    return false;
  }

  if (!/\d/.test(value)) {
    return false;
  }

  if (!/[\W_]/.test(value)) {
    return false;
  }

  return true;
}

export const PASSWORD_POLICY_MESSAGE = `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres e incluir al menos una mayúscula, un número y un símbolo.`;
