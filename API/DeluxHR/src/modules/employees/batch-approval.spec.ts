import { EmployeesService } from './employees.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
describe('Deferred selected employee approvals', () => {
  it('returns per-record results while continuing past self-approval or foreign-company failures', async () => {
    const service = new EmployeesService({} as any, {} as any);
    const activate = jest
      .spyOn(service, 'activate')
      .mockImplementation(async (_org, id) => {
        if (id === 'self')
          throw new ForbiddenException(
            'Creators cannot approve their own record',
          );
        if (id === 'foreign') throw new NotFoundException('Employee not found');
        return {} as any;
      });
    const result = await service.approveBatch(
      'org',
      ['self', 'valid', 'foreign'],
      { sub: 'checker' } as any,
    );
    expect(result.results.map((r) => r.approved)).toEqual([false, true, false]);
    expect(activate).toHaveBeenCalledWith(
      'org',
      'valid',
      { sub: 'checker' },
      false,
    );
  });
});
