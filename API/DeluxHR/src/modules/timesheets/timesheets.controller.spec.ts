import { Test, TestingModule } from '@nestjs/testing';
import { TimesheetsController } from './timesheets.controller';

describe('TimesheetsController', () => {
  let controller: TimesheetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimesheetsController],
    }).compile();

    controller = module.get<TimesheetsController>(TimesheetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
