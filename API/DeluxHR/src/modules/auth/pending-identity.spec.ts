import { AuthService } from './auth.service';
describe('Identity lookup during pending onboarding',()=>{
 const base:any={id:'u',fullName:'Admin',email:'admin@test',isActive:true,role:'COMPANY_ADMIN',organizationId:'org',organization:{id:'org',name:'Testing',status:'PENDING'}};
 function service(user:any){return new AuthService({user:{findUnique:jest.fn(async()=>user)}} as any,{} as any);}
 it('returns pending company administrator identity for the setup redirect',async()=>{expect(await service(base).me('u')).toMatchObject({role:'COMPANY_ADMIN',organization:{status:'PENDING'}});});
 it.each(['EMPLOYEE','HR_ADMIN','PAYROLL_ADMIN'])('blocks pending %s',async role=>{await expect(service({...base,role}).me('u')).rejects.toThrow('does not currently have access');});
 it.each(['SUSPENDED','REJECTED'])('blocks %s company admins',async status=>{await expect(service({...base,organization:{...base.organization,status}}).me('u')).rejects.toThrow('does not currently have access');});
 it('blocks inactive accounts',async()=>{await expect(service({...base,isActive:false}).me('u')).rejects.toThrow('inactive');});
});
