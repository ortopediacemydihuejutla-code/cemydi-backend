import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.favoritesService.listMine(user);
  }

  @Get('ids')
  listMyIds(@CurrentUser() user: AuthUser) {
    return this.favoritesService.listMyIds(user);
  }

  @Post('toggle/:productId')
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoritesService.toggle(user, productId);
  }

  @Post(':productId')
  add(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoritesService.add(user, productId);
  }

  @Delete(':productId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoritesService.remove(user, productId);
  }
}
