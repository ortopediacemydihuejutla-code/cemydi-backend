import { Test, TestingModule } from '@nestjs/testing';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

describe('BackupsController', () => {
  let controller: BackupsController;

  const mockBackupsService = {
    getDatabaseStatus: jest.fn(),
    listDatabaseBackupRecords: jest.fn(),
    getDatabaseBackupSchedule: jest.fn(),
    updateDatabaseBackupSchedule: jest.fn(),
    deleteDatabaseBackupSchedule: jest.fn(),
    createDatabaseBackupRecord: jest.fn(),
    createSingleTableBackupRecord: jest.fn(),
    createSingleSchemaBackupRecord: jest.fn(),
    getDatabaseBackupRecord: jest.fn(),
    createDatabaseBackup: jest.fn(),
    restoreDatabaseBackupRecord: jest.fn(),
    deleteDatabaseBackupRecord: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupsController],
      providers: [{ provide: BackupsService, useValue: mockBackupsService }],
    }).compile();

    controller = module.get<BackupsController>(BackupsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe obtener el estado de la base de datos', async () => {
    mockBackupsService.getDatabaseStatus.mockResolvedValue({ healthy: true });
    const result = await controller.getDatabaseStatus();
    expect(result).toEqual({ status: { healthy: true } });
  });

  it('debe listar respaldos', async () => {
    mockBackupsService.listDatabaseBackupRecords.mockResolvedValue([]);
    const result = await controller.listDatabaseBackups();
    expect(result).toEqual({ backups: [] });
  });

  it('debe crear respaldo de base de datos', async () => {
    mockBackupsService.createDatabaseBackupRecord.mockResolvedValue({
      backup: { id: 1 },
      logText: 'Exito',
    });
    const result = await controller.createDatabaseBackup();
    expect(result.message).toContain('correctamente');
  });

  it('debe restaurar respaldo de base de datos', async () => {
    mockBackupsService.restoreDatabaseBackupRecord.mockResolvedValue({
      logText: 'Restaurado',
    });
    const result = await controller.restoreDatabaseBackupById(1);
    expect(result.message).toContain('exitosamente');
  });

  it('debe eliminar respaldo', async () => {
    mockBackupsService.deleteDatabaseBackupRecord.mockResolvedValue({ id: 1 });
    const result = await controller.deleteDatabaseBackupRecord(1);
    expect(result.message).toContain('correctamente');
  });
});
