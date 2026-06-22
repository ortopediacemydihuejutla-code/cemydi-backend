import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { BCRYPT_ROUNDS } from '../../../common/crypto/bcrypt.constants';

export const PASSWORD_RESET_CODE_LENGTH = 8;

export function hashAuthValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateNumericAuthCode() {
  const max = 10 ** PASSWORD_RESET_CODE_LENGTH;
  return `${randomInt(0, max)}`.padStart(PASSWORD_RESET_CODE_LENGTH, '0');
}

export async function hashAuthCode(value: string) {
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

export async function verifyAuthCode(value: string, codeHash: string) {
  return bcrypt.compare(value, codeHash);
}
