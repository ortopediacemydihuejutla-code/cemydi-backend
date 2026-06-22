import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  localizeClientMessage,
  localizeValidationMessage,
  RATE_LIMIT_CLIENT_MESSAGE,
} from './client-error-messages.util';

describe('client-error-messages.util', () => {
  it('traduce ThrottlerException al español', () => {
    const message = localizeClientMessage({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'ThrottlerException: Too Many Requests',
      exception: new ThrottlerException(),
    });

    expect(message).toBe(RATE_LIMIT_CLIENT_MESSAGE);
  });

  it('traduce mensajes de class-validator', () => {
    expect(localizeValidationMessage('correo must be an email')).toBe(
      'El correo debe ser un correo electrónico válido',
    );
    expect(
      localizeValidationMessage(
        'password must be longer than or equal to 8 characters',
      ),
    ).toBe('La contraseña debe tener al menos 8 caracteres');
  });
});
