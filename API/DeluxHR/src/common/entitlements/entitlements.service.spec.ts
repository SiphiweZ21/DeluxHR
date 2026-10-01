import { Feature } from '@prisma/client';
import { EntitlementsService } from './entitlements.service';
describe('Subscription entitlement gate',() => {
 const db: any = { platformSubscription: { findUnique: jest.fn() }, organizationFeature: { findUnique: jest.fn(), count: jest.fn() } };
 const service = new EntitlementsService(db);
 it('keeps Core HR available when additional services are paused',async () => {
  db.platformSubscription.findUnique.mockResolvedValue({ status: 'PAUSED', endsAt: null });
  await expect(service.hasFeature('org-1',Feature.CORE_HR)).resolves.toBe(true);
  expect(db.organizationFeature.findUnique).not.toHaveBeenCalled();
 });
 it('blocks additional services on paused subscriptions',async()=>{db.platformSubscription.findUnique.mockResolvedValue({status:'PAUSED',endsAt:null}); await expect(service.hasAllFeatures('org-1',[Feature.CORE_HR,Feature.PAYROLL])).resolves.toBe(false);});
 it('allows legacy organizations without a subscription',async () => {
  db.platformSubscription.findUnique.mockResolvedValue(null);
  db.organizationFeature.findUnique.mockResolvedValue({ enabled: true });
  await expect(service.hasFeature('org-1',Feature.CORE_HR)).resolves.toBe(true);
 });
});
