import {EmployeeCompensationChangesService} from './employee-compensation-changes.service';
import {comparePassword} from '../../common/auth/password';
jest.mock('../../common/auth/password',()=>({comparePassword:jest.fn()}));
const actor:any={id:'admin',email:'admin@test.invalid',role:'COMPANY_ADMIN'};
function fixture(){
 const pending={id:'change',employeeId:'employee',organizationId:'org',status:'PENDING_APPROVAL',requestedByUserId:actor.id,proposedBasicSalary:11000,proposedPensionableSalary:11000,proposedHourlyRate:null,version:2};
 const tx:any={employeeCompensationChange:{findFirst:jest.fn().mockResolvedValue(pending),update:jest.fn().mockImplementation(({data})=>({...pending,...data}))},employeePayrollProfile:{update:jest.fn().mockResolvedValue({})}};
 const db:any={...tx,user:{findFirst:jest.fn().mockResolvedValue({passwordHash:'hash'})},$transaction:jest.fn(fn=>fn(tx))};
 const audit:any={log:jest.fn()};return {tx,db,audit,service:new EmployeeCompensationChangesService(db,audit)};
}
describe('Audited same-admin pay changes',()=>{
 beforeEach(()=>jest.mocked(comparePassword).mockResolvedValue(true));
 it('applies a requested salary increase using the same authorised admin and records the decision',async()=>{const x=fixture();const result=await x.service.approve('org','employee','change','password',actor);expect(result.status).toBe('APPROVED');expect(x.tx.employeePayrollProfile.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({basicSalary:11000})}));expect(x.audit.log).toHaveBeenCalledWith(expect.objectContaining({actorUserId:actor.id,action:'EMPLOYEE_COMPENSATION_CHANGE_APPROVED'}),x.tx);});
 it('still rejects a wrong password without changing pay',async()=>{const x=fixture();jest.mocked(comparePassword).mockResolvedValue(false);await expect(x.service.approve('org','employee','change','wrong',actor)).rejects.toThrow('Password is incorrect');expect(x.tx.employeePayrollProfile.update).not.toHaveBeenCalled();});
 it('requires an active account in the same company before reviewing pay',async()=>{const x=fixture();x.db.user.findFirst.mockResolvedValue(null);await expect(x.service.approve('org','employee','change','password',actor)).rejects.toThrow('re-authenticate');expect(x.db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:actor.id,organizationId:'org',isActive:true}}));expect(x.db.$transaction).not.toHaveBeenCalled();});
});
