import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { mapPrismaError } from '../errors/prisma-error.util';
import {
  localizeClientMessage,
  localizeErrorName,
} from '../errors/client-error-messages.util';

type ErrorResponseBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
};

type ResolvedException = {
  statusCode: number;
  message: string | string[];
  errorName?: string;
  stack?: string;
  internalMessage?: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    const resolved = this.resolveException(exception);
    const statusCode = resolved.statusCode;
    const clientMessage = this.buildClientMessage(
      resolved,
      isProduction,
      exception,
    );
    const body: ErrorResponseBody = {
      statusCode,
      message: clientMessage,
      error: localizeErrorName(resolved.errorName),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    this.logException(request, statusCode, resolved);

    response.status(statusCode).json(body);
  }

  private resolveException(exception: unknown): ResolvedException {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const message = this.extractMessage(response, exception.message);
      const errorName =
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof (response as { error?: unknown }).error === 'string'
          ? (response as { error: string }).error
          : exception.name;

      return {
        statusCode,
        message,
        errorName,
        stack: exception.stack,
        internalMessage: exception.message,
      };
    }

    const mapped = mapPrismaError(exception);
    if (mapped) {
      return this.resolveException(mapped);
    }

    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        errorName: exception.name,
        stack: exception.stack,
        internalMessage: exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      errorName: 'InternalServerError',
      stack: undefined,
      internalMessage: String(exception),
    };
  }

  private buildClientMessage(
    resolved: {
      statusCode: number;
      message: string | string[];
      internalMessage?: string;
    },
    isProduction: boolean,
    exception: unknown,
  ) {
    const isServerError =
      resolved.statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR);

    if (isProduction && isServerError) {
      return 'Error interno del servidor';
    }

    return localizeClientMessage({
      statusCode: resolved.statusCode,
      message: resolved.message,
      exception,
    });
  }

  private extractMessage(
    response: string | object,
    fallback: string,
  ): string | string[] {
    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message) || typeof message === 'string') {
        return message;
      }
    }

    return fallback;
  }

  private logException(
    request: Request,
    statusCode: number,
    resolved: {
      message: string | string[];
      errorName?: string;
      stack?: string;
      internalMessage?: string;
    },
  ) {
    const messageText = Array.isArray(resolved.message)
      ? resolved.message.join(', ')
      : resolved.message;
    const logMessage = `${request.method} ${request.url} -> ${statusCode} ${messageText}`;

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(logMessage, resolved.stack);
      return;
    }

    if (statusCode >= Number(HttpStatus.BAD_REQUEST)) {
      this.logger.warn(logMessage);
    }
  }
}
