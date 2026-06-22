import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BackupsService } from './backups.service';
import { CreateSchemaBackupDto } from './dto/create-schema-backup.dto';
import { CreateTableBackupDto } from './dto/create-table-backup.dto';
import { UpdateBackupScheduleDto } from './dto/update-backup-schedule.dto';

@Controller('backups')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('database/status')
  async getDatabaseStatus() {
    const status = await this.backupsService.getDatabaseStatus();
    return { status };
  }

  @Get('database/history')
  async listDatabaseBackups() {
    const backups = await this.backupsService.listDatabaseBackupRecords();
    return { backups };
  }

  @Get('database/schedule')
  async getDatabaseBackupSchedule() {
    const schedule = await this.backupsService.getDatabaseBackupSchedule();
    return { schedule };
  }

  @Put('database/schedule')
  async updateDatabaseBackupSchedule(@Body() body: UpdateBackupScheduleDto) {
    const schedule = await this.backupsService.updateDatabaseBackupSchedule({
      ...body,
    });
    return {
      schedule,
      message: 'Programacion de respaldos actualizada correctamente',
    };
  }

  @Delete('database/schedule')
  async deleteDatabaseBackupSchedule() {
    const schedule = await this.backupsService.deleteDatabaseBackupSchedule();
    return {
      schedule,
      message: 'Programacion automatica eliminada correctamente',
    };
  }

  @Post('database')
  @HttpCode(201)
  async createDatabaseBackup() {
    const result = await this.backupsService.createDatabaseBackupRecord();
    return {
      backup: result.backup,
      logText: result.logText,
      message: 'Respaldo generado y registrado correctamente',
    };
  }

  @Post('database/table')
  @HttpCode(201)
  async createSingleTableBackup(@Body() body: CreateTableBackupDto) {
    const result = await this.backupsService.createSingleTableBackupRecord(
      body.tableName,
    );
    return {
      backup: result.backup,
      logText: result.logText,
      message: 'Respaldo de tabla generado y registrado correctamente',
    };
  }

  @Post('database/schema')
  @HttpCode(201)
  async createSingleSchemaBackup(@Body() body: CreateSchemaBackupDto) {
    const result = await this.backupsService.createSingleSchemaBackupRecord(
      body.schemaName,
    );
    return {
      backup: result.backup,
      logText: result.logText,
      message: 'Respaldo de esquema generado y registrado correctamente',
    };
  }

  @Get('database/:id/download')
  async downloadDatabaseBackupById(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const backup = await this.backupsService.getDatabaseBackupRecord(id);

    response.setHeader('Content-Type', 'application/x-tar');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.fileName}"`,
    );
    response.status(200).send(backup.content);
  }

  @Get('database')
  async downloadDatabaseBackup(@Res() response: Response) {
    const backup = await this.backupsService.createDatabaseBackup();

    response.setHeader('Content-Type', 'application/x-tar');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.fileName}"`,
    );
    response.status(200).send(backup.content);
  }

  @Post('database/:id/restore')
  async restoreDatabaseBackupById(@Param('id', ParseIntPipe) id: number) {
    const result = await this.backupsService.restoreDatabaseBackupRecord(id);
    return {
      message: 'Base de datos restaurada exitosamente',
      logText: result.logText,
    };
  }

  @Delete('database/:id')
  async deleteDatabaseBackupRecord(@Param('id', ParseIntPipe) id: number) {
    const backup = await this.backupsService.deleteDatabaseBackupRecord(id);
    return { backup, message: 'Respaldo eliminado correctamente' };
  }
}
