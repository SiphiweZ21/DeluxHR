import { SaTaxEngineService } from './sa-tax-engine.service';

describe('SaTaxEngineService', () => {
  const engine = new SaTaxEngineService();

  it('uses the 2026/27 rates and primary rebate for a monthly employee', () => {
    const result = engine.calculate({
      paymentDate: new Date('2026-09-30'),
      payFrequency: 'MONTHLY',
      taxableRemuneration: 30000,
      uifRemuneration: 30000,
      sdlRemuneration: 30000,
      dateOfBirth: new Date('1990-01-01'),
      medicalSchemeMembers: 0,
      uifApplicable: true,
      sdlApplicable: true,
    });
    expect(result.taxYear).toBe('2026/27');
    expect(result.annualRebate).toBe(17820);
    expect(result.uifEmployee).toBe(177.12);
    expect(result.uifEmployer).toBe(177.12);
    expect(result.sdlEmployer).toBe(300);
    expect(result.paye).toBeGreaterThan(0);
  });

  it('applies medical credits only when medical scheme members are configured', () => {
    const result = engine.calculate({
      paymentDate: new Date('2026-09-30'),
      payFrequency: 'MONTHLY',
      taxableRemuneration: 40000,
      uifRemuneration: 40000,
      sdlRemuneration: 40000,
      dateOfBirth: new Date('1990-01-01'),
      medicalSchemeMembers: 3,
      uifApplicable: true,
      sdlApplicable: false,
    });
    expect(result.annualMedicalTaxCredit).toBe((376 + 376 + 254) * 12);
    expect(result.sdlEmployer).toBe(0);
  });

  it('adds age rebates when date of birth qualifies', () => {
    const result = engine.calculate({
      paymentDate: new Date('2026-09-30'),
      payFrequency: 'MONTHLY',
      taxableRemuneration: 30000,
      uifRemuneration: 30000,
      sdlRemuneration: 30000,
      dateOfBirth: new Date('1950-01-01'),
      uifApplicable: true,
      sdlApplicable: false,
    });
    expect(result.annualRebate).toBe(17820 + 9765 + 3249);
  });
});
