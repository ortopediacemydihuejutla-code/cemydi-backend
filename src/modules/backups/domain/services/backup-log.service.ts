import { Injectable } from '@nestjs/common';
import { GoogleDriveProvider } from '../../dto/backups.types';

@Injectable()
export class BackupLogService {
  composeBackupExecutionLog(input: {
    backupType: 'database' | 'schema' | 'table';
    tableName?: string;
    schemaName?: string;
    fileName: string;
    sizeBytes: number;
    requestedAt: Date;
    backupCreatedAt: string;
    provider: GoogleDriveProvider;
    verboseLog: string;
    recordId: number;
  }) {
    const lines = [
      '===== INICIO BACKUP =====',
      `Fecha: ${this.formatLogDate(input.requestedAt)}`,
      `${this.formatLogStamp(input.requestedAt)}  Solicitud recibida para ${
        input.backupType === 'table' && input.tableName
          ? `la tabla ${input.tableName}`
          : input.backupType === 'schema' && input.schemaName
            ? `el esquema ${input.schemaName}`
            : 'respaldo completo de la base de datos'
      }`,
      `${this.formatLogStamp(input.requestedAt)}  Nombre de archivo previsto: ${input.fileName}`,
      `${this.formatLogStamp(input.requestedAt)}  Ejecutando pg_dump en modo verbose...`,
    ];

    if (input.verboseLog) {
      lines.push(input.verboseLog);
    }

    const finishedAt =
      this.parseOptionalDate(input.backupCreatedAt) ?? new Date();
    lines.push(
      `${this.formatLogStamp(finishedAt)}  Archivo generado: ${input.fileName}`,
      `${this.formatLogStamp(finishedAt)}  Tamano final: ${this.formatBytes(input.sizeBytes)}`,
      `${this.formatLogStamp(finishedAt)}  Respaldo enviado a Google Drive (${input.provider})`,
      `${this.formatLogStamp(finishedAt)}  Registro guardado en historial local con ID ${input.recordId}`,
      'RESULTADO: BACKUP EXITOSO',
      '===== FIN BACKUP =====',
    );

    return lines.join('\n');
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

  formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
  }

  parseOptionalDate(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatLogDate(value: Date) {
    return value.toLocaleString('es-MX', {
      hour12: true,
    });
  }

  private formatLogStamp(value: Date) {
    return value.toISOString();
  }
}
