import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildPostgresConnectionArgs,
  buildPostgresConnectionEnv,
  executePostgresProcess,
  parseRequiredPostgresDatabaseUrlFromEnv,
  parseQualifiedPostgresName,
  resolvePostgresBinary,
  wrapPostgresCommandError,
} from '../../../../infrastructure/database-tools';
import { MaintenanceExecutorPort } from '../../domain/ports/maintenance-executor.port';
import { MaintenanceLogService } from '../../domain/services/maintenance-log.service';
import {
  MaintenanceOperation,
  PsqlExecutionResult,
} from '../../dto/maintenance.types';

@Injectable()
export class PostgresMaintenanceExecutorAdapter implements MaintenanceExecutorPort {
  private readonly maintenanceSchemas = [
    'accounts',
    'catalog',
    'management',
  ] as const;

  constructor(
    private readonly maintenanceLogService: MaintenanceLogService,
    private readonly configService: ConfigService,
  ) {}

  async runPsqlCommand(
    operation: MaintenanceOperation,
    tableName: string,
  ): Promise<PsqlExecutionResult> {
    const config = parseRequiredPostgresDatabaseUrlFromEnv({
      databaseUrl: this.configService.get<string>('DATABASE_URL'),
      directUrl: this.configService.get<string>('DATABASE_DIRECT_URL'),
      defaultSchema: 'management',
      onMissingUrl: () => {
        throw new InternalServerErrorException(
          'DATABASE_URL no esta configurada',
        );
      },
      onInvalidFormat: () => {
        throw new InternalServerErrorException(
          'DATABASE_URL tiene un formato invalido',
        );
      },
      onInvalidProtocol: () => {
        throw new InternalServerErrorException(
          'DATABASE_URL debe apuntar a PostgreSQL',
        );
      },
      onMissingDatabase: () => {
        throw new InternalServerErrorException(
          'DATABASE_URL no contiene el nombre de la base de datos',
        );
      },
      onInvalidSchema: () => {
        throw new InternalServerErrorException(
          'El schema de DATABASE_URL es invalido',
        );
      },
    });
    const target = this.parseQualifiedTableName(tableName);
    const sql = `${this.buildOperationSql(operation)} "${target.schema}"."${target.table}";`;
    const args = [
      ...buildPostgresConnectionArgs({
        host: config.host,
        port: config.port,
        username: config.username,
        database: config.database,
      }),
      '--command',
      sql,
      '--echo-all',
      '--set',
      'ON_ERROR_STOP=1',
    ];

    try {
      const result = await executePostgresProcess({
        command: resolvePostgresBinary(
          'psql',
          this.configService.get<string>('PSQL_PATH'),
        ),
        args,
        env: buildPostgresConnectionEnv(config),
      });
      const outputText = this.maintenanceLogService.normalizeProcessLog(
        `${result.stdout.toString('utf8')}\n${result.stderr.toString('utf8')}`,
      );

      if (result.exitCode === 0) {
        return { verboseLog: outputText };
      }

      throw new InternalServerErrorException(
        outputText ||
          `psql finalizo con codigo ${result.exitCode ?? 'desconocido'}`,
      );
    } catch (error) {
      throw wrapPostgresCommandError({
        error,
        commandName: 'psql',
        missingCommandMessage:
          'No se encontro psql. Configura PSQL_PATH o agrega PostgreSQL al PATH del servidor.',
        failedToStartMessage: 'No se pudo iniciar psql',
      });
    }
  }

  private parseQualifiedTableName(tableName: string) {
    const parsed = parseQualifiedPostgresName(
      tableName,
      this.maintenanceSchemas,
    );
    if (!parsed) {
      throw new BadRequestException('Nombre de tabla invalido');
    }

    return { schema: parsed.schema, table: parsed.name };
  }

  private buildOperationSql(operation: MaintenanceOperation) {
    if (operation === 'VACUUM_ANALYZE') {
      return 'VACUUM ANALYZE';
    }

    return operation;
  }
}
