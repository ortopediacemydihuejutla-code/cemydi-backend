import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PostgresAdvisoryLockService } from './postgres-advisory-lock.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PostgresAdvisoryLockService],
  exports: [PostgresAdvisoryLockService],
})
export class DatabaseToolsModule {}
