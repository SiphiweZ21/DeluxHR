import { Injectable } from '@nestjs/common';
import { PayFrequency } from '@prisma/client';

export type SaTaxInput = {
  paymentDate: Date;
  payFrequency: PayFrequency;
  taxableRemuneration: number;
  uifRemuneration: number;
  sdlRemuneration: number;
  dateOfBirth?: Date | null;
  medicalSchemeMembers?: number;
  retirementEmployeeContribution?: number;
  retirementEmployerContribution?: number;
  uifApplicable?: boolean;
  sdlApplicable?: boolean;
};

export type SaTaxResult = {
  taxYear: string;
  periodsPerYear: number;
  annualisedTaxableRemuneration: number;
  annualTaxBeforeRebates: number;
  annualRebate: number;
  annualMedicalTaxCredit: number;
  annualRetirementDeductionUsed: number;
  paye: number;
  uifEmployee: number;
  uifEmployer: number;
  sdlEmployer: number;
  notes: string[];
};

type TaxBracket = { upTo: number | null; base: number; rate: number; excessOver: number };

type TaxYearRules = {
  key: string;
  starts: string;
  ends: string;
  brackets: TaxBracket[];
  primaryRebate: number;
  secondaryRebate: number;
  tertiaryRebate: number;
  medicalFirstTwoMonthly: number;
  medicalAdditionalMonthly: number;
  uifMonthlyCeiling: number;
  uifRate: number;
  sdlRate: number;
  retirementDeductionRate: number;
  retirementAnnualCap: number;
};

const RULES_2027: TaxYearRules = {
  key: '2026/27',
  starts: '2026-03-01',
  ends: '2027-02-28',
  brackets: [
    { upTo: 245100, base: 0, rate: 0.18, excessOver: 0 },
    { upTo: 383100, base: 44118, rate: 0.26, excessOver: 245100 },
    { upTo: 530200, base: 79998, rate: 0.31, excessOver: 383100 },
    { upTo: 695800, base: 125599, rate: 0.36, excessOver: 530200 },
    { upTo: 887000, base: 185215, rate: 0.39, excessOver: 695800 },
    { upTo: 1878600, base: 259783, rate: 0.41, excessOver: 887000 },
    { upTo: null, base: 666339, rate: 0.45, excessOver: 1878600 },
  ],
  primaryRebate: 17820,
  secondaryRebate: 9765,
  tertiaryRebate: 3249,
  medicalFirstTwoMonthly: 376,
  medicalAdditionalMonthly: 254,
  uifMonthlyCeiling: 17712,
  uifRate: 0.01,
  sdlRate: 0.01,
  retirementDeductionRate: 0.275,
  retirementAnnualCap: 350000,
};

@Injectable()
export class SaTaxEngineService {
  calculate(input: SaTaxInput): SaTaxResult {
    const rules = this.resolveRules(input.paymentDate);
    const periodsPerYear = this.periodsPerYear(input.payFrequency);
    const notes: string[] = [];

    const annualisedBeforeRetirement = Math.max(0, input.taxableRemuneration) * periodsPerYear;
    const annualRetirementContribution = Math.max(
      0,
      (input.retirementEmployeeContribution ?? 0) + (input.retirementEmployerContribution ?? 0),
    ) * periodsPerYear;

    // Stage 2 payroll implementation: retirement contributions are limited to 27.5%
    // of annualised remuneration/taxable income and R350,000 p.a. Unused/excess amounts
    // require YTD/carry-forward handling in a later payroll compliance iteration.
    const annualRetirementDeductionUsed = Math.min(
      annualRetirementContribution,
      annualisedBeforeRetirement * rules.retirementDeductionRate,
      rules.retirementAnnualCap,
    );
    const annualisedTaxableRemuneration = Math.max(
      0,
      annualisedBeforeRetirement - annualRetirementDeductionUsed,
    );

    const annualTaxBeforeRebates = this.annualTax(annualisedTaxableRemuneration, rules);
    const age = this.ageAt(input.dateOfBirth ?? null, input.paymentDate);
    let annualRebate = rules.primaryRebate;
    if (age !== null && age >= 65) annualRebate += rules.secondaryRebate;
    if (age !== null && age >= 75) annualRebate += rules.tertiaryRebate;
    if (age === null) notes.push('Date of birth not configured; primary rebate only was applied.');

    const members = Math.max(0, Math.floor(input.medicalSchemeMembers ?? 0));
    const monthlyMedicalCredit = members === 0
      ? 0
      : members === 1
        ? rules.medicalFirstTwoMonthly
        : rules.medicalFirstTwoMonthly * 2 + Math.max(0, members - 2) * rules.medicalAdditionalMonthly;
    const annualMedicalTaxCredit = monthlyMedicalCredit * 12;

    const annualTaxAfterCredits = Math.max(
      0,
      annualTaxBeforeRebates - annualRebate - annualMedicalTaxCredit,
    );
    const paye = this.money(annualTaxAfterCredits / periodsPerYear);

    // UIF ceiling is monthly. Convert it to the employee's configured pay frequency.
    const uifPeriodCeiling = (rules.uifMonthlyCeiling * 12) / periodsPerYear;
    const uifBase = Math.min(Math.max(0, input.uifRemuneration), uifPeriodCeiling);
    const uifEmployee = input.uifApplicable === false ? 0 : this.money(uifBase * rules.uifRate);
    const uifEmployer = input.uifApplicable === false ? 0 : this.money(uifBase * rules.uifRate);
    const sdlEmployer = input.sdlApplicable ? this.money(Math.max(0, input.sdlRemuneration) * rules.sdlRate) : 0;

    notes.push('PAYE uses annualised statutory rates for the selected pay frequency.');
    notes.push('Variable remuneration, directives, YTD corrections and special fringe-benefit cases require additional payroll rules before production certification.');

    return {
      taxYear: rules.key,
      periodsPerYear,
      annualisedTaxableRemuneration: this.money(annualisedTaxableRemuneration),
      annualTaxBeforeRebates: this.money(annualTaxBeforeRebates),
      annualRebate: this.money(annualRebate),
      annualMedicalTaxCredit: this.money(annualMedicalTaxCredit),
      annualRetirementDeductionUsed: this.money(annualRetirementDeductionUsed),
      paye,
      uifEmployee,
      uifEmployer,
      sdlEmployer,
      notes,
    };
  }

  private resolveRules(paymentDate: Date): TaxYearRules {
    const iso = paymentDate.toISOString().slice(0, 10);
    if (iso >= RULES_2027.starts && iso <= RULES_2027.ends) return RULES_2027;
    throw new Error(`No South African payroll tax rules configured for payment date ${iso}`);
  }

  private periodsPerYear(frequency: PayFrequency): number {
    if (frequency === 'WEEKLY') return 52;
    if (frequency === 'FORTNIGHTLY') return 26;
    return 12;
  }

  private annualTax(income: number, rules: TaxYearRules): number {
    const bracket = rules.brackets.find((b) => b.upTo === null || income <= b.upTo) ?? rules.brackets[rules.brackets.length - 1];
    return bracket.base + Math.max(0, income - bracket.excessOver) * bracket.rate;
  }

  private ageAt(dateOfBirth: Date | null, at: Date): number | null {
    if (!dateOfBirth) return null;
    let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const month = at.getUTCMonth() - dateOfBirth.getUTCMonth();
    if (month < 0 || (month === 0 && at.getUTCDate() < dateOfBirth.getUTCDate())) age--;
    return Math.max(0, age);
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
