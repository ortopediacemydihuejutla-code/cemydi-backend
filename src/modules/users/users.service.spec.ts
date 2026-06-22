import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/services/auth.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: {
    user: {
      update: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    forUser: jest.Mock;
    asAdmin: jest.Mock;
  };
  let authService: {
    revokeUserSessions: jest.Mock;
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        update: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      forUser: jest.fn(),
      asAdmin: jest.fn(),
    };
    authService = {
      revokeUserSessions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('revokes other sessions when password changes from profile', async () => {
    const db = {
      user: {
        update: jest.fn().mockResolvedValue({
          id: 7,
          nombre: 'User',
          correo: 'user@example.com',
          telefono: null,
          direccion: null,
          rol: Rol.CLIENT,
          activo: true,
          emailVerifiedAt: null,
        }),
      },
    };
    prismaService.forUser.mockReturnValue(db);

    await service.updateMe(
      {
        sub: 7,
        id: 7,
        correo: 'user@example.com',
        rol: Rol.CLIENT,
        sid: 'keep-this-session',
      },
      {
        password: 'SecureP@ss1',
      },
    );

    expect(authService.revokeUserSessions).toHaveBeenCalledWith(7, {
      excludeSid: 'keep-this-session',
    });
  });

  it('revokes all sessions when admin changes the role', async () => {
    const db = {
      user: {
        update: jest.fn().mockResolvedValue({
          id: 9,
          nombre: 'Admin User',
          correo: 'admin@example.com',
          telefono: null,
          direccion: null,
          rol: Rol.ADMIN,
          activo: true,
          emailVerifiedAt: null,
        }),
      },
    };
    prismaService.asAdmin.mockReturnValue(db);

    await service.update(
      {
        sub: 1,
        id: 1,
        correo: 'root@example.com',
        rol: Rol.ADMIN,
        sid: 'admin-session',
      },
      9,
      {
        rol: Rol.ADMIN,
      },
    );

    expect(authService.revokeUserSessions).toHaveBeenCalledWith(9);
  });

  it('marks admin-created users as email verified so they can log in immediately', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockResolvedValue({
      id: 11,
      nombre: 'Staff User',
      correo: 'staff@example.com',
      telefono: null,
      direccion: null,
      rol: Rol.CLIENT,
      activo: true,
      emailVerifiedAt: new Date('2026-06-06T12:00:00.000Z'),
    });

    await service.create({
      nombre: 'Staff User',
      correo: 'staff@example.com',
      password: 'SecureP@ss1',
    });

    expect(prismaService.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });
});
