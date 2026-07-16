import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import { LegalDocumentsService } from './legal-documents.service';

@Controller('legal-documents')
export class LegalDocumentsController {
  constructor(private readonly legalDocumentsService: LegalDocumentsService) {}

  @Get(':slug')
  getPublicContent(@Param('slug') slug: string) {
    return this.legalDocumentsService.getPublicContent(slug);
  }

  @Patch(':slug')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param('slug') slug: string, @Body() dto: UpdateLegalDocumentDto) {
    return this.legalDocumentsService.update(slug, dto);
  }
}
