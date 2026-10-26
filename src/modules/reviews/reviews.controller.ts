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
  UseGuards,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsAdminQueryDto } from './dto/list-reviews-admin-query.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('product/:productId')
  listApprovedByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.reviewsService.listApprovedByProduct(productId);
  }

  @Get('testimonials')
  listHomeTestimonials() {
    return this.reviewsService.listHomeTestimonials();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.reviewsService.listMine(user);
  }

  @Get('product/:productId/mine')
  @UseGuards(JwtAuthGuard)
  getMyReviewByProduct(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.reviewsService.getMyByProduct(user, productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  submit(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.submit(user, dto);
  }

  @Get('admin')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  listForAdmin(@Query() query: ListReviewsAdminQueryDto) {
    return this.reviewsService.listForAdmin({
      status: query.status,
      userId: query.userId,
    });
  }

  @Patch(':id/approve')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.reviewsService.approve(user, id);
  }

  @Patch(':id/home-visibility')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  setShowOnHome(
    @Param('id', ParseIntPipe) id: number,
    @Body('showOnHome') showOnHome: boolean,
  ) {
    return this.reviewsService.setShowOnHome(id, showOnHome === true);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.reviewsService.remove(id);
  }
}
