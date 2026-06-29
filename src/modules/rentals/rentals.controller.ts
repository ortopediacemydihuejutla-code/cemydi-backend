import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Rol } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { ListRentalsAdminQueryDto } from './dto/list-rentals-admin-query.dto';
import { RejectRentalDto } from './dto/reject-rental.dto';
import { RentalsService } from './rentals.service';

type UploadedPrescriptionFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const MAX_PRESCRIPTION_BYTES = 8 * 1024 * 1024;

@Controller('rentals')
@UseGuards(JwtAuthGuard)
export class RentalsController {
  constructor(private readonly rentalsService: RentalsService) {}

  @Get('mine')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.rentalsService.listMine(user);
  }

  @Post('from-cart')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_PRESCRIPTION_BYTES },
    }),
  )
  createFromCart(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() prescriptions: UploadedPrescriptionFile[] = [],
  ) {
    return this.rentalsService.createFromCart(user, prescriptions);
  }

  @Patch(':id/cancel')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  cancelMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.cancelMine(user, id);
  }

  @Get('items/:itemId/prescription')
  @Roles(Rol.CLIENT, Rol.ADMIN)
  @UseGuards(RolesGuard)
  async downloadPrescription(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Res() res: Response,
  ) {
    const document = await this.rentalsService.getPrescriptionDocument(
      user,
      itemId,
    );
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', String(document.data.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.fileName)}"`,
    );
    res.send(document.data);
  }

  @Get('admin')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  listForAdmin(@Query() query: ListRentalsAdminQueryDto) {
    return this.rentalsService.listForAdmin({
      status: query.status,
      search: query.search,
    });
  }

  @Patch(':id/approve')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.approve(user, id);
  }

  @Patch(':id/reject')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectRentalDto,
  ) {
    return this.rentalsService.reject(user, id, dto.reason);
  }

  @Patch(':id/deliver')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.deliver(user, id);
  }

  @Patch(':id/return')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  returnRental(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.returnRental(user, id);
  }
}
