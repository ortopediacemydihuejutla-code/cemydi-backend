import { Rol } from '@prisma/client';

export type PublicUser = {
  id: number;
  nombre: string;
  correo: string;
  activo: boolean;
  rol: Rol;
  emailVerifiedAt: Date | null;
};

export type SerializedAuthUser = {
  id: number;
  nombre: string;
  correo: string;
  activo: boolean;
  rol: Rol;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
};

export type SecurityOverviewResponse = {
  activeSessions: Array<{
    sessionId: string;
    userId: number;
    nombre: string;
    correo: string;
    rol: Rol;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
  }>;
  loginAttempts: Array<{
    id: number;
    userId: number | null;
    nombre: string;
    correo: string;
    success: boolean;
    reason: string | null;
    attemptedAt: string;
  }>;
  summary: {
    activeSessions: number;
    recentAttempts: number;
    failedAttempts: number;
  };
};

export type JwtPayloadWithExp = {
  exp?: number;
};

export type SessionAuthResult = {
  accessToken: string;
  refreshToken: string;
  user: SerializedAuthUser;
  accessCookieMaxAgeMs: number;
  refreshCookieMaxAgeMs: number;
};
