import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeCompensationChangesController } from './employee-compensation-changes.controller';
import { EmployeeCompensationChangesService } from './employee-compensation-changes.service';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

describe('Pay changes production route registration', () => {
  it('registers the controller and its dependencies in the production application', async () => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-registration-secret-at-least-32-characters';
    let module: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>> | undefined;
    try {
      module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .compile();
      expect(module.get(EmployeeCompensationChangesController)).toBeDefined();
      expect(module.get(EmployeeCompensationChangesService)).toBeDefined();
    } finally {
      if (module) await module.close();
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });
  it.each([
    ['history', '/', RequestMethod.GET],
    ['pending', 'pending', RequestMethod.GET],
    ['submit', '/', RequestMethod.POST],
    ['approve', ':compensationChangeId/approve', RequestMethod.POST],
    ['reject', ':compensationChangeId/reject', RequestMethod.POST],
  ])('retains the employee-scoped %s endpoint', (method, path, verb) => {
    expect(Reflect.getMetadata(PATH_METADATA, EmployeeCompensationChangesController)).toBe('employees/:employeeId/compensation-changes');
    const handler = EmployeeCompensationChangesController.prototype[method as keyof EmployeeCompensationChangesController];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
  });
});
