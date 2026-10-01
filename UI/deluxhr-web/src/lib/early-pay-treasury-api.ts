import { workforceRequest as request, getAuthHeaders, handleResponse } from './api';
export type TreasuryFunding = {id:string;name:string;bank:string;adapterId:string;accountHolder:string;accountNumberMasked:string;branchCode:string;status:string;createdBy:string};
export type TreasuryBatchSummary = {id:string;status:string;totalCents:number;currency:string;paymentDate:string;preparedBy:string;approvedBy:string|null;submittedBy:string|null;_count?:{items:number}};
export type TreasuryItem = {id:string;requestId:string;organizationId:string;employeeName:string;amountCents:number;paymentReference:string;status:string;bankReference:string|null;resultEvidence:string|null;beneficiary:{accountNumberMasked:string;accountHolderName:string;bankName:string;branchCode:string;accountType:string;transferType:string}};
export type TreasuryBatch = TreasuryBatchSummary & {funding:{name:string;bank:string;adapterId:string;accountNumberMasked:string;branchCode:string};items:TreasuryItem[];submissionReference:string|null;submissionEvidence:string|null};
export type TreasuryEligible = {id:string;organizationId:string;netDisbursement:number;transferType:string;employee:{firstName:string;lastName:string;employeeNumber:string};organization:{name:string}};
export type TreasuryWorkspace = {accounts:TreasuryFunding[];batches:TreasuryBatchSummary[];adapters:{id:string;bank:string;channel:string;version:string}[];productionExportsAvailable:false};
export type TreasuryInspection = {funding:Record<string,string>;items:{id:string;beneficiary:Record<string,string>}[]};
const base='platform-admin/early-pay-treasury',id=encodeURIComponent;
export const treasuryWorkspace=()=>request<TreasuryWorkspace>(base);
export const treasuryEligible=()=>request<TreasuryEligible[]>(`${base}/eligible`);
export const treasuryDetail=(key:string)=>request<TreasuryBatch>(`${base}/batches/${id(key)}`);
export const treasuryFundingCreate=(payload:Record<string,string>)=>request<TreasuryFunding>(`${base}/funding`,'POST',payload);
export const treasuryFundingAction=(key:string,action:'review'|'retire',payload:Record<string,string>)=>request<unknown>(`${base}/funding/${id(key)}/${action}`,'POST',payload);
export const treasuryFundingInspect=(key:string,payload:Record<string,string>)=>request<{id:string;accountNumber:string;accountHolder:string;branchCode:string}>(`${base}/funding/${id(key)}/inspect`,'POST',payload);
export const treasuryPrepare=(payload:{fundingAccountId:string;paymentDate:string;requestIds:string[];reason:string})=>request<TreasuryBatch>(`${base}/batches`,'POST',payload);
export const treasuryAction=(key:string,action:'approve'|'cancel'|'submit',payload:Record<string,string>)=>request<TreasuryBatch>(`${base}/batches/${id(key)}/${action}`,'POST',payload);
export const treasuryInspect=(key:string,payload:Record<string,string>)=>request<TreasuryInspection>(`${base}/batches/${id(key)}/inspect`,'POST',payload);
export const treasuryResult=(key:string,item:string,payload:Record<string,string>)=>request<TreasuryBatch>(`${base}/batches/${id(key)}/items/${id(item)}/result`,'POST',payload);
export async function treasuryDownload(key:string,draft=false) {
  const res=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/${base}/batches/${id(key)}/${draft?'draft':'report'}`,{method:'POST',headers:getAuthHeaders(),cache:'no-store'});
  if(!res.ok){await handleResponse(res,'Unable to download treasury file.');return;}
  const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=draft?`DRAFT-NOT-FOR-BANK-UPLOAD-EARLY-PAY-${key}.txt`:`DeluxHR-Early-Pay-report-${key}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
