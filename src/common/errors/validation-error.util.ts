import { BadRequestException, ValidationError } from '@nestjs/common';
import { localizeValidationMessage } from './client-error-messages.util';

export function collectValidationMessages(errors: ValidationError[]) {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      messages.push(
        ...Object.values(error.constraints).map(localizeValidationMessage),
      );
    }

    if (error.children?.length) {
      messages.push(...collectValidationMessages(error.children));
    }
  }

  return messages;
}

export function buildValidationException(errors: ValidationError[]) {
  const messages = collectValidationMessages(errors);

  return new BadRequestException(
    messages.length > 0 ? messages : ['Datos de entrada inválidos'],
  );
}
