import { LeaveDecisionStatus, LeaveDocumentKind } from '@prisma/client';
import { priorStepsApproved, requirementsMet } from './leave-workflows.service';
describe('leave approval prerequisites', () => {
 it('holds the second step until the first has approved', () => {
   expect(priorStepsApproved([{ order: 1, status: LeaveDecisionStatus.PENDING }, { order: 2, status: LeaveDecisionStatus.PENDING }],2)).toBe(false);
   expect(priorStepsApproved([{ order: 1, status: LeaveDecisionStatus.APPROVED }, { order: 2, status: LeaveDecisionStatus.PENDING }],2)).toBe(true);
 });
 it('requires a medical certificate at the configured threshold', () => {
   expect(requirementsMet(false,3,3,[LeaveDocumentKind.SUPPORTING])).toBe(false);
   expect(requirementsMet(false,3,3,[LeaveDocumentKind.MEDICAL_CERTIFICATE])).toBe(true);
 });
 it('enforces a general supporting document when configured', () => {
   expect(requirementsMet(true,null,2,[])).toBe(false);
 });
});
