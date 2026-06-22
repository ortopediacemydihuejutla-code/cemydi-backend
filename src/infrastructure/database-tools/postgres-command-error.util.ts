import { InternalServerErrorException } from '@nestjs/common';

export function wrapPostgresCommandError(input: {
  error: unknown;
  commandName: string;
  missingCommandMessage: string;
  failedToStartMessage: string;
}): InternalServerErrorException {
  const { error, commandName, missingCommandMessage, failedToStartMessage } =
    input;

  if (error instanceof InternalServerErrorException) {
    return error;
  }

  const candidate = error as NodeJS.ErrnoException;
  if (candidate?.code === 'ENOENT') {
    return new InternalServerErrorException(missingCommandMessage);
  }

  if (error instanceof Error) {
    return new InternalServerErrorException(
      `${failedToStartMessage}: ${error.message}`,
    );
  }

  return new InternalServerErrorException(
    `${commandName} finalizo con un error desconocido`,
  );
}
