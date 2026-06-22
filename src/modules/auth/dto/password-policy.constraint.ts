import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY_MESSAGE,
} from './password-policy';

@ValidatorConstraint({ name: 'passwordPolicy', async: false })
export class PasswordPolicyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isPasswordPolicyCompliant(value);
  }

  defaultMessage() {
    return PASSWORD_POLICY_MESSAGE;
  }
}
