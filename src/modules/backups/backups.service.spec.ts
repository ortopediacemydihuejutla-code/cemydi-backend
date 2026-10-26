import { Test, TestingModule } from '@nestjs/testing';
import { BackupsUseCasesService } from './application/use-cases/backups-use-cases.service';
import { BackupsService } from './backups.service';
import { BackupsSchedulerService } from './infrastructure/scheduler/backups-scheduler.service';

describe('BackupsService', () => {
  let service: BackupsService;

  const mockUseCasesService = {
    createDatabaseBackupRecord: jest.fn(),
    createSingleSchemaBackupRecord: jest.fn(),
    createSingleTableBackupRecord: jest.fn(),
    listDatabaseBackupRecords: jest.fn(),
    getDatabaseBackupSchedule: jest.fn(),
    updateDatabaseBackupSchedule: jest.fn(),
    deleteDatabaseBackupSchedule: jest.fn(),
    getDatabaseBackupRecord: jest.fn(),
    createDatabaseBackup: jest.fn(),
    restoreDatabaseBackupRecord: jest.fn(),
    deleteDatabaseBackupRecord: jest.fn(),
    getDatabaseStatus: jest.fn(),
  };

  const mockSchedulerService = {
    start: jest.fn(),
    stop: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupsService,
        {
          provide: BackupsUseCasesService,
          useValue: mockUseCasesService,
        },
        {
          provide: BackupsSchedulerService,
          useValue: mockSchedulerService,
        },
      ],
    }).compile();

    service = module.get<BackupsService>(BackupsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe iniciar y detener el scheduler en los hooks de ciclo de vida', () => {
    service.onModuleInit();
    expect(mockSchedulerService.start).toHaveBeenCalled();

    service.onModuleDestroy();
    expect(mockSchedulerService.stop).toHaveBeenCalled();
  });

  it('debe delegar operaciones de respaldo a BackupsUseCasesService', async () => {
    mockUseCasesService.listDatabaseBackupRecords.mockResolvedValue([]);
    const list = await service.listDatabaseBackupRecords();
    expect(list).toEqual([]);
    expect(mockUseCasesService.listDatabaseBackupRecords).toHaveBeenCalled();

    mockUseCasesService.createDatabaseBackupRecord.mockResolvedValue({
      backup: { id: 1 },
      logText: 'ok',
    });
    const created = await service.createDatabaseBackupRecord();
    expect(created.backup.id).toBe(1);

    mockUseCasesService.getDatabaseStatus.mockResolvedValue({
      status: 'healthy',
    });
    const status = await service.getDatabaseStatus();
    expect(status).toEqual({ status: 'healthy' });
  });
});
