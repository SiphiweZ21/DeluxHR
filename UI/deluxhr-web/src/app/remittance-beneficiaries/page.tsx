"use client";
import { PageTitle } from "../../components/leave/ui";
import { RemittanceBeneficiaries } from "../../components/remittances/beneficiaries";
export default function BeneficiariesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Company & access"
        title="Remittance beneficiaries"
        text="Set up independently approved creditor accounts and statutory payment routes."
      />
      <RemittanceBeneficiaries />
    </div>
  );
}
