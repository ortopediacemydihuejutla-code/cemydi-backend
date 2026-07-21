import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Rol } from '@prisma/client';
import { sanitizeFileName } from '../../common/files/safe-file-name.util';
import { RENTAL_PRESCRIPTION_UPLOAD_LIMITS } from '../../common/files/upload-limits.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CreateRentalFromCartDto } from './dto/create-rental-from-cart.dto';
import { ListRentalsAdminQueryDto } from './dto/list-rentals-admin-query.dto';
import { ListMyRentalsQueryDto } from './dto/list-my-rentals-query.dto';
import { RejectRentalDto } from './dto/reject-rental.dto';
import { ReviewRentalDocumentDto } from './dto/review-rental-document.dto';
import { UpdateRentalDepositDto } from './dto/update-rental-deposit.dto';
import { RentalDocumentsService } from './rental-documents.service';
import type { UploadedPrescriptionFile } from './rental-documents.types';
import { RentalsService } from './rentals.service';

@Controller('rentals')
@UseGuards(JwtAuthGuard)
export class RentalsController {
  constructor(
    private readonly rentalsService: RentalsService,
    private readonly rentalDocumentsService: RentalDocumentsService,
  ) {}

  @Get('mine')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMyRentalsQueryDto,
  ) {
    return this.rentalsService.listMine(user, query);
  }

  @Get('mine/:id')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  getMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.getMine(user, id);
  }

  @Post('from-cart')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  createFromCart(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRentalFromCartDto,
  ) {
    return this.rentalsService.createFromCart(user, dto);
  }

  @Post('cart-items/:itemId/prescription')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { ...RENTAL_PRESCRIPTION_UPLOAD_LIMITS, files: 1 },
    }),
  )
  uploadCartItemPrescription(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIntPipe) itemId: number,
    @UploadedFile() file?: UploadedPrescriptionFile,
  ) {
    return this.rentalDocumentsService.uploadForCartItem(user, itemId, file);
  }

  @Post('items/:itemId/prescription')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { ...RENTAL_PRESCRIPTION_UPLOAD_LIMITS, files: 1 },
    }),
  )
  uploadRentalItemPrescription(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIntPipe) itemId: number,
    @UploadedFile() file?: UploadedPrescriptionFile,
  ) {
    return this.rentalDocumentsService.uploadForRentalItem(user, itemId, file);
  }

  @Delete('cart-items/:itemId/prescription')
  @Roles(Rol.CLIENT)
  @UseGuards(RolesGuard)
  deleteCartItemPrescription(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.rentalDocumentsService.deleteForCartItem(user, itemId);
  }

  @Get('documents/:documentId/content')
  @Roles(Rol.CLIENT, Rol.ADMIN)
  @UseGuards(RolesGuard)
  async getDocumentContent(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Query('disposition') disposition: string | undefined,
    @Res() res: Response,
  ) {
    const attachment = disposition === 'attachment';
    const document = await this.rentalDocumentsService.getAuthorizedContent(
      user,
      documentId,
      attachment,
    );
    const safeFileName = sanitizeFileName(document.fileName, 'receta');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', String(document.data.length));
    res.setHeader(
      'Content-Disposition',
      `${attachment ? 'attachment' : 'inline'}; filename="${encodeURIComponent(safeFileName)}"`,
    );
    res.send(document.data);
  }

  @Patch('documents/:documentId/review')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  reviewDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewRentalDocumentDto,
  ) {
    return this.rentalDocumentsService.reviewForAdmin(
      user,
      documentId,
      dto.status,
      dto.rejectionReason,
    );
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
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(document.data.length));
    const safeFileName = sanitizeFileName(document.fileName, 'receta');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(safeFileName)}"`,
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
      page: query.page,
      pageSize: query.pageSize,
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

  @Patch(':id/cancel-approved')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  cancelApproved(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rentalsService.cancelApproved(user, id);
  }

  @Patch(':id/deposit')
  @Roles(Rol.ADMIN)
  @UseGuards(RolesGuard)
  updateDeposit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRentalDepositDto,
  ) {
    return this.rentalsService.updateDeposit(user, id, dto);
  }
}
