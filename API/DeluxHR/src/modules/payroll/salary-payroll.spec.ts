import { PayrollService } from './payroll.service';
import { SaTaxEngineService } from './tax-engine/sa-tax-engine.service';
import { PayrollBatchesService } from '../payroll-batches/payroll-batches.service';

const dto={employeeId:'employee',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-31',paymentDate:'2026-10-31'};
function setup(){
 let generated:any;
 const profile={id:'profile',basicSalary:10000,pensionableSalary:10000,hourlyRate:null,payFrequency:'MONTHLY',dateOfBirth:new Date('1990-01-01'),benefits:[],deductions:[]};
 const employee={id:'employee',firstName:'Test',lastName:'Account',status:'ACTIVE',payrollProfile:profile};
 const tx:any={
  $executeRaw:jest.fn().mockResolvedValue(1),
  employee:{findFirst:jest.fn().mockResolvedValue(employee)},
  earning:{findMany:jest.fn(),updateMany:jest.fn()},
  payrollSettings:{upsert:jest.fn().mockResolvedValue({payFrequency:'MONTHLY',uifRegistered:true,sdlApplicable:false})},
  payrollBatch:{findUnique:jest.fn().mockResolvedValue(null),create:jest.fn().mockImplementation(async ({data})=>({id:'cycle',...data})),update:jest.fn().mockResolvedValue({})},
  payrollRun:{findFirst:jest.fn().mockImplementation(async ({where})=>where.id?generated:null),create:jest.fn().mockImplementation(async ({data})=>(generated={id:'run',...data})),delete:jest.fn()},
  payrollRunStatusHistory:{create:jest.fn().mockResolvedValue({})},
  payrollBatchEmployee:{create:jest.fn().mockResolvedValue({})},
  payrollLedgerEntry:{createMany:jest.fn().mockResolvedValue({count:1})},
  earlyPayRequest:{findMany:jest.fn().mockResolvedValue([])},
 };
 const db:any={$transaction:jest.fn().mockImplementation(fn=>fn(tx))};
 const tax=new SaTaxEngineService();jest.spyOn(tax,'calculate');
 return {service:new PayrollService(db,tax),tx,employee,tax};
}
describe('Salary payroll without timesheets',()=>{
 it('calculates only the selected employee from salary, snapshots adjustments and links the payment cycle',async()=>{
  const {service,tx,tax}=setup();
  const run=await service.generateFromSalary('company',{...dto,taxableAllowance:500,additionalDeduction:200,adjustmentReason:'Test allowance and loan adjustment'},'maker');
  expect(run.grossEarnings).toBe(10500);
  expect(run.recurringDeductions).toBe(200);
  expect(run.netPay).toBeCloseTo(10500-run.taxAmount-run.uifEmployee-200,2);
  expect(run).toMatchObject({employeeId:'employee',payrollBatchId:'cycle',status:'CALCULATED'});
  expect(tax.calculate).toHaveBeenCalledWith(expect.objectContaining({taxableRemuneration:10500,uifRemuneration:10500,payFrequency:'MONTHLY'}));
  expect(tx.earning.findMany).not.toHaveBeenCalled();expect(tx.earning.updateMany).not.toHaveBeenCalled();
  expect(tx.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'employee',organizationId:'company'}}));
  expect(tx.payrollBatchEmployee.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({employeeId:'employee',payrollRunId:'run',processingStatus:'GENERATED'})}));
  expect(tx.payrollBatch.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'CALCULATED',generationStartedByUserId:'maker'})}));
  expect(tx.payrollLedgerEntry.createMany.mock.calls[0][0].data).toEqual(expect.arrayContaining([expect.objectContaining({code:'EARNING_SALARY',amount:10000,sourceType:'SALARY_PROFILE'})]));
 });
 it('uses configured benefits and recurring deductions without any earning records',async()=>{
  const {service,employee}=setup();
  (employee.payrollProfile.benefits as any[]).push({id:'benefit-assignment',benefitPlan:{id:'benefit',active:true,effectiveFrom:new Date('2026-01-01'),effectiveTo:null,name:'Fund',providerName:'Provider',type:'RETIREMENT_FUND',contributionBasis:'BASIC_SALARY',employeeMethod:'PERCENTAGE',employeeValue:5,employerMethod:'PERCENTAGE',employerValue:5}});
  (employee.payrollProfile.deductions as any[]).push({id:'loan',effectiveFrom:new Date('2026-01-01'),effectiveTo:null,method:'FIXED_AMOUNT',value:200,deductionDefinition:{id:'definition',name:'Loan',creditorName:'Employer'}});
  const run=await service.generateFromSalary('company',dto,'maker');
  expect(run.employeeBenefitDeductions).toBe(500);expect(run.employerContributions).toBe(500);expect(run.recurringDeductions).toBe(200);
 });
 it('rejects duplicate overlapping runs before creating any cycle',async()=>{
  const {service,tx}=setup();tx.payrollRun.findFirst.mockResolvedValue({id:'existing'});
  await expect(service.generateFromSalary('company',dto,'maker')).rejects.toThrow('overlapping');
  expect(tx.payrollBatch.create).not.toHaveBeenCalled();expect(tx.payrollRun.create).not.toHaveBeenCalled();
 });
 it.each(['REVIEWED','APPROVED','LOCKED'])('rejects additions to a %s cycle',async status=>{
  const {service,tx}=setup();tx.payrollBatch.findUnique.mockResolvedValue({id:'cycle',status});
  await expect(service.generateFromSalary('company',dto,'maker')).rejects.toThrow('already under review');
  expect(tx.payrollRun.create).not.toHaveBeenCalled();
 });
 it('requires a profile and a positive basic salary',async()=>{
  const {service,employee}=setup();employee.payrollProfile.basicSalary=0;
  await expect(service.generateFromSalary('company',dto,'maker')).rejects.toThrow('positive basic salary');
  (employee as any).payrollProfile=null;
  await expect(service.generateFromSalary('company',dto,'maker')).rejects.toThrow('profile must be configured');
 });
 it('rejects inactive employees and unexplained adjustments',async()=>{
  const {service,employee,tx}=setup();employee.status='SUSPENDED';
  await expect(service.generateFromSalary('company',dto,'maker')).rejects.toThrow();expect(tx.payrollRun.create).not.toHaveBeenCalled();
  await expect(service.generateFromSalary('company',{...dto,taxableAllowance:200},'maker')).rejects.toThrow('reason');
 });
 it('blocks destructive individual recalculation and status changes on cycle runs',async()=>{
  const {service}=setup();jest.spyOn(service,'findOne').mockResolvedValue({id:'run',payrollBatchId:'cycle',status:'CALCULATED'} as any);
  await expect(service.recalculateTotals('company','run','maker')).rejects.toThrow('cycle');
  await expect(service.updateStatus('company','run',{status:'REVIEWED'} as any,'checker')).rejects.toThrow('cycle approvals');
 });
});

describe('Single-admin payroll cycle approval',()=>{
 function setupApproval(actorId:string){
  const tx:any={$executeRaw:jest.fn(),payrollBatch:{findFirst:jest.fn().mockResolvedValue({status:'REVIEWED',_count:{payrollRuns:1}}),update:jest.fn()},payrollRun:{updateMany:jest.fn()},payrollRunStatusHistory:{createMany:jest.fn()}};
  const db:any={payrollBatch:{findFirst:jest.fn().mockResolvedValue({id:'cycle',status:'REVIEWED',createdByUserId:'maker',generationStartedByUserId:'maker',reviewedByUserId:'checker',_count:{payrollRuns:1}})},payrollSettings:{findUnique:jest.fn().mockResolvedValue({approvalMode:'MAKER_CHECKER'})},payrollRun:{findMany:jest.fn().mockResolvedValue([{id:'run'}])},$transaction:jest.fn().mockImplementation(fn=>fn(tx))};
  const service=new PayrollBatchesService(db,{log:jest.fn()} as any,{} as any,{} as any);
  jest.spyOn(service,'getReview').mockResolvedValue({employeeSummary:{generating:0,pending:0,failed:0,blocked:0},totals:{}} as any);
  return {service,db,tx,actor:{sub:actorId,email:'test@example.com',role:'COMPANY_ADMIN',organizationId:'company'} as any};
 }
 it('lets the independent checker review and approve',async()=>{const {service,actor,tx}=setupApproval('checker');await service.approve('company','cycle',actor);expect(tx.payrollBatch.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'APPROVED',approvedByUserId:'checker'})}));});
 it('allows the authorised payroll maker to approve',async()=>{const {service,actor,tx}=setupApproval('maker');await service.approve('company','cycle',actor);expect(tx.payrollBatch.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({approvedByUserId:'maker'})}));});
 it('rejects approval if the cycle changed after the review snapshot',async()=>{const {service,actor,tx}=setupApproval('checker');tx.payrollBatch.findFirst.mockResolvedValue({status:'CALCULATED',_count:{payrollRuns:2}});await expect(service.approve('company','cycle',actor)).rejects.toThrow('cycle changed');expect(tx.payrollBatch.update).not.toHaveBeenCalled();});

});
