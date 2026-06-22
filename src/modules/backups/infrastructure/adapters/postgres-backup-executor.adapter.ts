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
import { BackupExecutorPort } from '../../domain/ports/backup-executor.port';
import { BackupLogService } from '../../domain/services/backup-log.service';
import { PgDumpResult } from '../../dto/backups.types';

@Injectable()
export class PostgresBackupExecutorAdapter implements BackupExecutorPort {
  private readonly backupSchemas = [
    'accounts',
    'catalog',
    'management',
  ] as const;

  constructor(
    private readonly backupLogService: BackupLogService,
    private readonly configService: ConfigService,
  ) {}

  async runPgDump(options?: {
    tableName?: string;
    schemaName?: string;
  }): Promise<PgDumpResult> {
    const databaseConfig = parseRequiredPostgresDatabaseUrlFromEnv({
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
    const args = [
      '--format=tar',
      '--no-owner',
      '--no-privileges',
      '--encoding=UTF8',
      '--blobs',
      '--verbose',
      ...buildPostgresConnectionArgs({
        host: databaseConfig.host,
        port: databaseConfig.port,
        username: databaseConfig.username,
        database: databaseConfig.database,
        databaseBeforeUsername: true,
      }),
    ];

    if (options?.tableName) {
      const target = this.parseQualifiedTableName(options.tableName);
      args.push('--table', `${target.schema}.${target.table}`);
    } else if (options?.schemaName) {
      const normalizedSchemaName = this.normalizeSchemaName(options.schemaName);
      args.push('--schema', normalizedSchemaName);
    }

    try {
      const result = await executePostgresProcess({
        command: resolvePostgresBinary(
          'pg_dump',
          this.configService.get<string>('PG_DUMP_PATH'),
        ),
        args,
        env: buildPostgresConnectionEnv(databaseConfig),
      });

      if (result.exitCode === 0) {
        if (result.stdout.length > 0) {
          return {
            content: result.stdout,
            verboseLog: this.backupLogService.normalizeProcessLog(
              result.stderr.toString('utf8'),
            ),
          };
        }

        throw new InternalServerErrorException(
          'pg_dump finalizo sin contenido de respaldo',
        );
      }

      const stderrMessage = result.stderr.toString('utf8').trim();
      throw new InternalServerErrorException(
        stderrMessage ||
          `pg_dump finalizo con codigo ${result.exitCode ?? 'desconocido'}`,
      );
    } catch (error) {
      throw wrapPostgresCommandError({
        error,
        commandName: 'pg_dump',
        missingCommandMessage:
          'No se encontro pg_dump. Configura PG_DUMP_PATH o agrega PostgreSQL al PATH del servidor.',
        failedToStartMessage: 'No se pudo iniciar pg_dump',
      });
    }
  }

  async runPgRestore(content: Buffer): Promise<string> {
    const databaseConfig = parseRequiredPostgresDatabaseUrlFromEnv({
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

    const args = [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--verbose',
      ...buildPostgresConnectionArgs({
        host: databaseConfig.host,
        port: databaseConfig.port,
        username: databaseConfig.username,
        database: databaseConfig.database,
        databaseBeforeUsername: true,
      }),
    ];

    try {
      const result = await executePostgresProcess({
        command: resolvePostgresBinary(
          'pg_restore',
          this.configService.get<string>('PG_RESTORE_PATH'),
        ),
        args,
        env: buildPostgresConnectionEnv(databaseConfig),
        stdin: content,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      const log = this.backupLogService.normalizeProcessLog(
        result.stderr.toString('utf8'),
      );

      if (result.exitCode === 0 || result.exitCode === 1) {
        return log;
      }

      throw new InternalServerErrorException(
        log ||
          `pg_restore finalizo con codigo ${result.exitCode ?? 'desconocido'}`,
      );
    } catch (error) {
      throw wrapPostgresCommandError({
        error,
        commandName: 'pg_restore',
        missingCommandMessage:
          'No se encontro pg_restore. Configura PG_RESTORE_PATH o agrega PostgreSQL al PATH del servidor.',
        failedToStartMessage: 'No se pudo iniciar pg_restore',
      });
    }
  }

  private parseQualifiedTableName(tableName: string) {
    const parsed = parseQualifiedPostgresName(tableName, this.backupSchemas);
    if (!parsed) {
      throw new BadRequestException('Nombre de tabla invalido');
    }

    return { schema: parsed.schema, table: parsed.name };
  }

  private normalizeSchemaName(schemaName: string) {
    const normalized = String(schemaName ?? '')
      .trim()
      .toLowerCase();

    if (
      !this.backupSchemas.includes(
        normalized as (typeof this.backupSchemas)[number],
      )
    ) {
      throw new BadRequestException('Nombre de esquema invalido');
    }

    return normalized;
  }
}
