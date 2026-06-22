import { Injectable } from '@nestjs/common';
import {
  MaintenanceOperation,
  MaintenanceRunResult,
} from '../../dto/maintenance.types';

@Injectable()
export class MaintenanceLogService {
  createStartLogs(
    operation: MaintenanceOperation,
    startedAt: Date,
    tableName: string | null,
    schemaName: string | null,
    tableCount: number,
  ) {
    return [
      '===== INICIO MANTENIMIENTO =====',
      `Fecha: ${this.formatLogDate(startedAt)}`,
      `${this.formatLogStamp(startedAt)}  Operacion solicitada: ${this.formatOperationLabel(operation)}`,
      `${this.formatLogStamp(startedAt)}  Alcance: ${
        tableName
          ? `tabla ${tableName}`
          : schemaName
            ? `esquema ${schemaName} (${tableCount} tabla(s))`
            : `base de datos completa (${tableCount} tabla(s))`
      }`,
      `${this.formatLogStamp(startedAt)}  Iniciando ${this.formatOperationLabel(operation)}...`,
    ];
  }

  createSuccessResult(input: {
    operation: MaintenanceOperation;
    schemaName: string | null;
    tableName: string | null;
    processedTables: number;
    startedAt: Date;
    finishedAt: Date;
    logs: string[];
  }): MaintenanceRunResult {
    input.logs.push(
      `${this.formatLogStamp(input.finishedAt)}  Finalizado correctamente`,
      'RESULTADO: MANTENIMIENTO EXITOSO',
      '===== FIN MANTENIMIENTO =====',
    );

    return {
      operation: input.operation,
      schemaName: input.schemaName,
      tableName: input.tableName,
      processedTables: input.processedTables,
      startedAt: input.startedAt.toISOString(),
      finishedAt: input.finishedAt.toISOString(),
      logText: this.normalizeProcessLog(input.logs.join('\n')),
      message: `${this.formatOperationLabel(input.operation)} ejecutado correctamente`,
    };
  }

  createFailurePayload(input: {
    operation: MaintenanceOperation;
    schemaName: string | null;
    tableName: string | null;
    startedAt: Date;
    finishedAt: Date;
    logs: string[];
    error: unknown;
  }) {
    const message =
      input.error instanceof Error && input.error.message.trim()
        ? input.error.message.trim()
        : 'Error desconocido durante el mantenimiento';
    input.logs.push(
      `${this.formatLogStamp(input.finishedAt)}  Error detectado: ${message}`,
      'RESULTADO: MANTENIMIENTO FALLIDO',
      '===== FIN MANTENIMIENTO =====',
    );

    return {
      message: `No se pudo ejecutar ${this.formatOperationLabel(input.operation)}`,
      logText: this.normalizeProcessLog(input.logs.join('\n')),
      operation: input.operation,
      schemaName: input.schemaName,
      tableName: input.tableName,
      startedAt: input.startedAt.toISOString(),
      finishedAt: input.finishedAt.toISOString(),
    };
  }

  normalizeProcessLog(value: string) {
    return value
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(
        (line, index, all) =>
          line.length > 0 || (index > 0 && all[index - 1] !== ''),
      )
      .join('\n')
      .trim();
  }

  formatOperationLabel(operation: MaintenanceOperation) {
    if (operation === 'VACUUM_ANALYZE') {
      return 'VACUUM ANALYZE';
    }

    return operation;
  }

  formatLogStamp(value: Date) {
    return value.toISOString();
  }

  private formatLogDate(value: Date) {
    return value.toLocaleString('es-MX', {
      hour12: true,
    });
  }
}
