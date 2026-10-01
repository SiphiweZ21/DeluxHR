import { CustomerOnboardingController } from './customer-onboarding.controller';
describe('Company setup profile', () => {
  it.each([true, false])(
    'returns saved profile with payroll-required=%s and omits private storage keys',
    async (payroll) => {
      const c: any = Object.create(CustomerOnboardingController.prototype);
      c.onboarding = {
        assertAdmin: jest.fn(),
        readiness: jest.fn(async () => ({
          checklist: [{ key: 'payrollSettings', required: payroll }],
        })),
      };
      c.org = {
        findOne: jest.fn(async () => ({
          name: 'Testing',
          email: 'company@example.test',
          logoStorageKey: 'private',
          features: [],
          timezone: 'Africa/Johannesburg',
        })),
      };
      const result = await c.companyProfile({
        organizationId: 'org',
        role: 'COMPANY_ADMIN',
      });
      expect(result).toMatchObject({
        name: 'Testing',
        email: 'company@example.test',
        payrollRequired: payroll,
      });
      expect(result).not.toHaveProperty('logoStorageKey');
      expect(result).not.toHaveProperty('features');
      expect(c.org.findOne).toHaveBeenCalledWith('org');
      expect(c.onboarding.assertAdmin).toHaveBeenCalled();
    },
  );
});
