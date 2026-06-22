import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AlexaService } from './alexa.service';
import { FindAlexaProductsQueryDto } from './dto/find-alexa-products-query.dto';

@Controller('alexa')
export class AlexaController {
  constructor(private readonly alexaService: AlexaService) {}

  @Get('welcome')
  getWelcome() {
    return this.alexaService.getWelcome();
  }

  @Get('products')
  getProducts(@Query() query: FindAlexaProductsQueryDto) {
    return this.alexaService.getProducts(query);
  }

  @Get('products/search/:name')
  searchProducts(@Param('name') name: string) {
    return this.alexaService.searchProducts(name);
  }

  @Get('products/:id')
  getProductDetail(@Param('id', ParseIntPipe) id: number) {
    return this.alexaService.getProductDetail(id);
  }

  @Get('categories')
  getCategories() {
    return this.alexaService.getCategories();
  }

  @Get('promotions')
  getPromotions() {
    return this.alexaService.getPromotions();
  }

  @Get('services')
  getServices() {
    return this.alexaService.getServices();
  }

  @Get('branches')
  getBranches() {
    return this.alexaService.getBranches();
  }

  @Get('contact')
  getContact() {
    return this.alexaService.getContact();
  }

  @Get('help')
  getHelp() {
    return this.alexaService.getHelp();
  }

  @Get('exit')
  getExit() {
    return this.alexaService.getExit();
  }
}
