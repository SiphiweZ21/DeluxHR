import {ALLOW_FEATURE_SETUP} from './allow-feature-setup.decorator';
import { ForbiddenException } from '@nestjs/common';
import { Feature } from '@prisma/client';
import { FeaturesGuard } from './features.guard';
describe('Optional service setup gate', () => {
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { organizationId: 'company' } }),
    }),
  };
  const reflector: any = {
    getAllAndOverride: jest.fn(() => [Feature.PAYROLL]),
  };
  const service: any = {
    hasAllFeatures: jest.fn(),
    incompleteSetup: jest.fn(),
  };
  const guard = new FeaturesGuard(reflector, service);
  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockImplementation((key:string)=>key===ALLOW_FEATURE_SETUP?false:[Feature.PAYROLL]);
    service.hasAllFeatures.mockResolvedValue(true);
    service.incompleteSetup.mockResolvedValue([]);
  });
  it('blocks selected services with unfinished setup and offers administrator assistance', async () => {
    service.incompleteSetup.mockResolvedValue(['openingPayroll']);
    try {
      await guard.canActivate(context);
      throw new Error('Expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        code: 'MODULE_SETUP_REQUIRED',
        setupSteps: ['openingPayroll'],
        message: expect.stringContaining('company administrator'),
      });
    }
  });
  it('allows selected services after setup is complete', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
  it('does not query setup for unselected services', async () => {
    service.hasAllFeatures.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toThrow('not included');
    expect(service.incompleteSetup).not.toHaveBeenCalled();
  });
  it('allows feature configuration while its data is incomplete, without bypassing entitlement checks',async()=>{
    reflector.getAllAndOverride.mockImplementation((key:string)=>key===ALLOW_FEATURE_SETUP?true:[Feature.PAYROLL]);
    service.incompleteSetup.mockResolvedValue(['payrollSettings']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(service.hasAllFeatures).toHaveBeenCalledWith('company',[Feature.PAYROLL]);
    expect(service.incompleteSetup).not.toHaveBeenCalled();
    service.hasAllFeatures.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toThrow('not included');
  });
  it('names the actual missing setting for feature usage',async()=>{
    service.incompleteSetup.mockResolvedValue(['registration','payrollSettings']);
    await expect(guard.canActivate(context)).rejects.toThrow('company registration and tax number, Payroll settings');
  });

});
