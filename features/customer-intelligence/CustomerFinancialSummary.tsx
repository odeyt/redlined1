'use client';

import type { CustomerLifetimeProfile } from '@/intelligence/customer/types';

interface Props {
  profile: CustomerLifetimeProfile;
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function CustomerFinancialSummary({ profile }: Props) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <span className="text-sm font-medium">Financial Summary</span>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Lifetime Revenue</p>
          <p className="font-semibold">${fmt(profile.lifetimeRevenue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Avg Invoice</p>
          <p className="font-semibold">${fmt(profile.averageInvoiceValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Invoices Paid</p>
          <p className="font-semibold">{profile.paidInvoiceCount} / {profile.invoiceCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Outstanding</p>
          <p className={`font-semibold ${profile.unpaidBalance > 0 ? 'text-red-600' : ''}`}>
            ${fmt(profile.unpaidBalance)}
          </p>
        </div>
        {profile.approvalRate != null && (
          <div>
            <p className="text-muted-foreground">Estimate Approval</p>
            <p className="font-semibold">{Math.round(profile.approvalRate * 100)}%</p>
          </div>
        )}
        <div>
          <p className="text-muted-foreground">Total Visits</p>
          <p className="font-semibold">{profile.visitCount}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic">
        Internal operational metrics only — not for sharing with customers.
      </p>
    </div>
  );
}
