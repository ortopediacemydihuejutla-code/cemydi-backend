import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  const usersService = {
    getMe: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    updateMe: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns an anonymous session without querying the database', () => {
    expect(controller.getMe()).toEqual({ user: null });
    expect(usersService.getMe).not.toHaveBeenCalled();
  });

  it('returns the authenticated user profile', async () => {
    const authUser: AuthUser = {
      sub: 7,
      id: 7,
      sid: 'session-7',
      correo: 'cliente@cemydi.com',
      rol: Rol.CLIENT,
    };
    const response = { user: { id: 7, correo: authUser.correo } };
    usersService.getMe.mockResolvedValue(response);

    await expect(controller.getMe(authUser)).resolves.toEqual(response);
    expect(usersService.getMe).toHaveBeenCalledWith(authUser);
  });
});
