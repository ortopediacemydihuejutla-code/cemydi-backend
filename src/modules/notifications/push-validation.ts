import { BadRequestException } from '@nestjs/common';
import type { RegisterPushDto } from './notification.dto';

export function validatePushSubscription(dto: RegisterPushDto) {
  if (dto.channel === 'EXPO') {
    if (
      !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(
        dto.endpoint,
      )
    ) {
      throw new BadRequestException(
        'El token push del dispositivo no es válido',
      );
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(dto.endpoint);
  } catch {
    throw new BadRequestException('Suscripción web inválida');
  }
  const allowedHosts = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'web.push.apple.com',
  ];
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      allowedHosts.includes(url.hostname) ||
      url.hostname.endsWith('.notify.windows.com')
    )
  ) {
    throw new BadRequestException('Proveedor Web Push no admitido');
  }
  if (
    !dto.p256dh ||
    !dto.auth ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(dto.p256dh) ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(dto.auth) ||
    Buffer.from(dto.p256dh, 'base64url').length !== 65 ||
    Buffer.from(dto.auth, 'base64url').length !== 16
  ) {
    throw new BadRequestException(
      'Las claves de la suscripción web no son válidas',
    );
  }
}
