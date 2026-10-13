import { PayrollBatchesService } from './payroll-batches.service';
import { PayrollPaymentsService } from '../payroll-payments/payroll-payments.service';

describe('Partial payroll coverage', () => {
  it('allows calculation without banking while excluding employees without a profile', async () => {
    const employee = {id:'test',employeeNumber:'test123',firstName:'Test',lastName:'Account',status:'ACTIVE',paymentDetails:[],riskEvents:[],payrollProfile:{id:'profile',basicSalary:10000,hourlyRate:null,taxNumber:'123',dateOfBirth:new Date('1990-01-01')}};
    const db:any = {$transaction:jest.fn().mockResolvedValue([]),payrollBatchEmployee:{upsert:jest.fn().mockResolvedValue({})},payrollBatch:{findFirst:jest.fn().mockResolvedValue({id:'batch',payPeriodStart:new Date('2026-10-01'),payPeriodEnd:new Date('2026-10-31'),paymentDate:null})},employee:{findMany:jest.fn().mockResolvedValue([employee,{...employee,id:'manual',payrollProfile:null}])}};
    const result = await new PayrollBatchesService(db,{} as any,{} as any,{} as any).evaluateEligibility('org','batch');
    expect(result.employees[0]).toMatchObject({employeeId:'test',eligibility:'WARNING'});
    expect(result.employees[0].reasons).toEqual(expect.arrayContaining([expect.objectContaining({code:'MISSING_APPROVED_PAYMENT_DETAILS'})]));
    expect(result.employees[1]).toMatchObject({employeeId:'manual',eligibility:'BLOCKED'});
    expect(result.employees[1].reasons).toEqual(expect.arrayContaining([expect.objectContaining({code:'MISSING_PAYROLL_PROFILE'})]));
    expect(db.payrollBatchEmployee.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({employeeId:'test',eligibilityReasons:[],eligibilityWarnings:expect.arrayContaining([expect.objectContaining({code:'MISSING_APPROVED_PAYMENT_DETAILS'})])})}));
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'org'}}));
  });
  it('still blocks actual payment preparation without approved banking', () => {
    const service:any = new PayrollPaymentsService({} as any,{} as any);
    const result = service.evaluatePaymentReadiness({id:'batch',title:'Test',status:'LOCKED',lockedAt:new Date(),currency:'ZAR',payrollRuns:[{id:'run',employeeId:'test',status:'LOCKED',lockedAt:new Date(),currency:'ZAR',netPay:9000,employee:{employeeNumber:'test123',firstName:'Test',lastName:'Account',paymentDetails:[]}}]});
    expect(result.canPrepare).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({severity:'BLOCKED',code:'APPROVED_PAYMENT_DETAILS_REQUIRED'})]));
  });
});
