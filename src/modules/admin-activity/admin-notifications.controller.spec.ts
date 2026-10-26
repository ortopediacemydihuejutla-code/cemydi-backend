import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;

  const mockAdminNotificationsService = {
    listCurrent: jest.fn(),
    markAsRead: jest.fn(),
  };

  const mockUser: AuthUser = {
    id: 1,
    correo: 'admin@cemydi.com',
    nombre: 'Admin',
    rol: Rol.ADMIN,
    activo: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [
        {
          provide: AdminNotificationsService,
          useValue: mockAdminNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<AdminNotificationsController>(
      AdminNotificationsController,
    );
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar listCurrent con el id del usuario', async () => {
    mockAdminNotificationsService.listCurrent.mockResolvedValue({
      unreadCount: 0,
      items: [],
    });
    const result = await controller.listCurrent(mockUser, { limit: 20 });
    expect(mockAdminNotificationsService.listCurrent).toHaveBeenCalledWith(
      1,
      20,
    );
    expect(result).toEqual({ unreadCount: 0, items: [] });
  });

  it('debe delegar markAsRead con los ids especificados', async () => {
    mockAdminNotificationsService.markAsRead.mockResolvedValue({
      updatedCount: 2,
    });
    const result = await controller.markAsRead(mockUser, {
      ids: ['review:1', 'stock:2'],
    });
    expect(mockAdminNotificationsService.markAsRead).toHaveBeenCalledWith(1, [
      'review:1',
      'stock:2',
    ]);
    expect(result).toEqual({ updatedCount: 2 });
  });
});
