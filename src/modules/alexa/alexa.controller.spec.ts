import { Test, TestingModule } from '@nestjs/testing';
import { AlexaController } from './alexa.controller';
import { AlexaService } from './alexa.service';

describe('AlexaController', () => {
  let controller: AlexaController;
  let service: {
    getWelcome: jest.Mock;
    getProducts: jest.Mock;
    searchProducts: jest.Mock;
    getProductDetail: jest.Mock;
    getCategories: jest.Mock;
    getPromotions: jest.Mock;
    getServices: jest.Mock;
    getBranches: jest.Mock;
    getContact: jest.Mock;
    getHelp: jest.Mock;
    getExit: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getWelcome: jest.fn(),
      getProducts: jest.fn(),
      searchProducts: jest.fn(),
      getProductDetail: jest.fn(),
      getCategories: jest.fn(),
      getPromotions: jest.fn(),
      getServices: jest.fn(),
      getBranches: jest.fn(),
      getContact: jest.fn(),
      getHelp: jest.fn(),
      getExit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlexaController],
      providers: [
        {
          provide: AlexaService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AlexaController>(AlexaController);
  });

  it('delegates product list queries to the Alexa service', () => {
    const query = { availableOnly: true, search: 'silla' };
    service.getProducts.mockReturnValue({ items: [] });

    expect(controller.getProducts(query)).toEqual({ items: [] });
    expect(service.getProducts).toHaveBeenCalledWith(query);
  });

  it('delegates voice product searches to the Alexa service', () => {
    service.searchProducts.mockReturnValue({ items: [] });

    expect(controller.searchProducts('andadera')).toEqual({ items: [] });
    expect(service.searchProducts).toHaveBeenCalledWith('andadera');
  });

  it('delegates static Alexa endpoints to the service', () => {
    service.getWelcome.mockReturnValue({ screen: 'welcome' });
    service.getContact.mockReturnValue({ screen: 'contact' });
    service.getHelp.mockReturnValue({ screen: 'help' });

    expect(controller.getWelcome()).toEqual({ screen: 'welcome' });
    expect(controller.getContact()).toEqual({ screen: 'contact' });
    expect(controller.getHelp()).toEqual({ screen: 'help' });
  });
});
