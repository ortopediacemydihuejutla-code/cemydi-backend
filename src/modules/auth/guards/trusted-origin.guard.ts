import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthConfigService } from '../services/auth-config.service';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: AuthConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Login sets cookies before a session exists, so require a trusted web origin.
    if (!this.config.isTrustedWebOrigin(request.headers.origin)) {
      throw new ForbiddenException('Origen de la solicitud no permitido');
    }
    return true;
  }
}
