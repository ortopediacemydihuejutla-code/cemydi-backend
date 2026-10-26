import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  collectValidationMessages,
  buildValidationException,
} from './validation-error.util';

describe('validation-error.util', () => {
  it('collects and localizes validation messages from flat ValidationError constraints', () => {
    const errors: ValidationError[] = [
      {
        property: 'correo',
        constraints: {
          isEmail: 'correo must be an email',
        },
      },
    ];

    const messages = collectValidationMessages(errors);
    expect(messages).toEqual([
      'El correo debe ser un correo electrónico válido',
    ]);
  });

  it('collects validation messages recursively from nested children errors', () => {
    const errors: ValidationError[] = [
      {
        property: 'parent',
        children: [
          {
            property: 'child',
            constraints: {
              isNotEmpty: 'El nombre es obligatorio',
            },
          },
        ],
      },
    ];

    const messages = collectValidationMessages(errors);
    expect(messages).toEqual(['El nombre es obligatorio']);
  });

  it('returns BadRequestException with default message when no constraint errors are present', () => {
    const exception = buildValidationException([]);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      message: ['Datos de entrada inválidos'],
      error: 'Bad Request',
    });
  });
});
