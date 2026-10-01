type PayslipLine = {
  sequence?: number;
  category?: string;
  effect?: string;
  code?: string;
  description?: string;
  amount?: number;
  currency?: string;
  creditorName?: string | null;
};

type PayslipViewModel = {
  payslipNumber: string;
  status: string;
  generatedAt: string | Date;
  issuedAt?: string | Date | null;
  notes?: string | null;
  periodLabel?: string | null;
  snapshotVersion?: number;
  organization?: Record<string, any> | null;
  employee?: Record<string, any> | null;
  payment?: Record<string, any> | null;
  payroll?: Record<string, any> | null;
  earnings?: PayslipLine[];
  deductions?: PayslipLine[];
  employerContributions?: PayslipLine[];
  netSettlement?: PayslipLine[];
  totals?: Record<string, number>;
};

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatMoney(value?: number | null, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
  }).format(Number(value ?? 0));
}

function nonZero(lines: PayslipLine[] = []) {
  return lines.filter((line) => Math.abs(Number(line.amount ?? 0)) > 0.000001);
}

function moneyRows(lines: PayslipLine[], currency: string) {
  return nonZero(lines)
    .map(
      (line) => `
        <tr>
          <td>
            <strong>${esc(line.description || line.code || 'Payroll item')}</strong>
            ${
              line.creditorName
                ? `<div class="muted small">${esc(line.creditorName)}</div>`
                : ''
            }
          </td>
          <td class="amount">${formatMoney(line.amount, currency)}</td>
        </tr>
      `,
    )
    .join('');
}

function address(company: Record<string, any>) {
  return [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.province,
    company.postalCode,
    company.country,
  ]
    .filter(Boolean)
    .map(esc)
    .join(', ');
}

export function buildPayslipHtml(payslip: PayslipViewModel) {
  const company = payslip.organization ?? {};
  const employee = payslip.employee ?? {};
  const payment = payslip.payment ?? {};
  const payroll = payslip.payroll ?? {};
  const currency = payroll.currency ?? 'ZAR';

  const employeeName =
    `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
  const companyName = company.legalName || company.name || 'Employer';

  const earnings = nonZero(payslip.earnings);
  const deductions = nonZero(payslip.deductions);
  const employerContributions = nonZero(payslip.employerContributions);

  const employerContributionTotal = employerContributions.reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0,
  );

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #0f172a;
    background: #ffffff;
    font-size: 12px;
  }
  .header {
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    color: #ffffff;
    padding: 22px 24px;
    border-radius: 14px;
    margin-bottom: 18px;
  }
  .header-row, .two-col, .summary {
    display: flex;
    gap: 12px;
  }
  .header-row { justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 25px; font-weight: 800; letter-spacing: -0.5px; }
  .tagline { margin-top: 4px; color: #e0e7ff; font-size: 11px; }
  .doc-title { text-align: right; }
  .doc-title .label { color: #e0e7ff; font-size: 11px; }
  .doc-title .number { font-size: 16px; font-weight: 700; margin-top: 5px; }
  .pill {
    display: inline-block;
    margin-top: 7px;
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(255,255,255,.16);
    font-size: 10px;
    font-weight: 700;
  }
  .card {
    border: 1px solid #e2e8f0;
    border-radius: 11px;
    padding: 13px 14px;
    background: #fff;
  }
  .two-col { margin-bottom: 12px; }
  .two-col > .card { width: 50%; }
  h2 {
    font-size: 12px;
    margin: 0 0 9px;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .line { margin: 3px 0; }
  .muted { color: #64748b; }
  .small { font-size: 10px; }
  .value { font-weight: 700; }
  .summary { margin: 14px 0; }
  .summary .card { flex: 1; background: #f8fafc; }
  .summary .net { background: #0f172a; color: #fff; border-color: #0f172a; }
  .summary .net .muted { color: #cbd5e1; }
  .big { font-size: 15px; font-weight: 800; margin-top: 5px; }
  .section { margin-top: 14px; page-break-inside: avoid; }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
  }
  th {
    background: #f1f5f9;
    color: #475569;
    text-align: left;
    padding: 8px 10px;
    font-size: 10px;
    text-transform: uppercase;
  }
  td {
    padding: 8px 10px;
    border-top: 1px solid #e2e8f0;
  }
  .amount { text-align: right; font-weight: 700; white-space: nowrap; }
  .empty {
    border: 1px dashed #cbd5e1;
    color: #64748b;
    padding: 10px;
    border-radius: 9px;
  }
  .net-banner {
    margin-top: 14px;
    padding: 14px 16px;
    border-radius: 11px;
    background: #0f172a;
    color: #fff;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .net-banner .amount { font-size: 20px; }
  .footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-row">
      <div>
        <div class="brand">${esc(company.name || 'DeluxHR')}</div>
        <div class="tagline">${esc(company.legalName && company.legalName !== company.name ? company.legalName : 'Payroll statement')}</div>
      </div>
      <div class="doc-title">
        <div class="label">PAYSLIP</div>
        <div class="number">${esc(payslip.payslipNumber)}</div>
        <div class="pill">${esc(payslip.status)}</div>
      </div>
    </div>
  </div>

  <div class="two-col">
    <div class="card">
      <h2>Employer</h2>
      <div class="line value">${esc(companyName)}</div>
      ${company.registrationNumber ? `<div class="line">Registration: ${esc(company.registrationNumber)}</div>` : ''}
      ${company.taxNumber ? `<div class="line">Tax reference: ${esc(company.taxNumber)}</div>` : ''}
      ${address(company) ? `<div class="line muted">${address(company)}</div>` : ''}
    </div>

    <div class="card">
      <h2>Employee</h2>
      <div class="line value">${esc(employeeName || '-')}</div>
      ${employee.employeeNumber ? `<div class="line">Employee no: ${esc(employee.employeeNumber)}</div>` : ''}
      ${employee.jobTitle ? `<div class="line">Occupation: ${esc(employee.jobTitle)}</div>` : ''}
      ${employee.departmentName ? `<div class="line muted">${esc(employee.departmentName)}</div>` : ''}
    </div>
  </div>

  <div class="two-col">
    <div class="card">
      <h2>Pay period</h2>
      <div class="line"><span class="muted">Period:</span> <span class="value">${formatDate(payroll.payPeriodStart)} - ${formatDate(payroll.payPeriodEnd)}</span></div>
      <div class="line"><span class="muted">Payment date:</span> <span class="value">${formatDate(payroll.paymentDate)}</span></div>
      ${payroll.taxYear ? `<div class="line"><span class="muted">Tax year:</span> ${esc(payroll.taxYear)}</div>` : ''}
    </div>

    <div class="card">
      <h2>Payment destination</h2>
      ${
        payment.maskedAccountNumber
          ? `
            <div class="line value">${esc(payment.bankName || 'Bank account')}</div>
            <div class="line">Account: ${esc(payment.maskedAccountNumber)}</div>
            ${payment.accountType ? `<div class="line muted">${esc(payment.accountType)}</div>` : ''}
          `
          : `<div class="line muted">No payment destination included in this snapshot.</div>`
      }
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="muted">Gross earnings</div>
      <div class="big">${formatMoney(payroll.grossEarnings, currency)}</div>
    </div>
    <div class="card">
      <div class="muted">Deductions</div>
      <div class="big">${formatMoney(payroll.totalDeductions, currency)}</div>
    </div>
    <div class="card net">
      <div class="muted">Net pay</div>
      <div class="big">${formatMoney(payroll.netPay, currency)}</div>
    </div>
  </div>

  <div class="section">
    <h2>Earnings</h2>
    ${
      earnings.length
        ? `<table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>${moneyRows(earnings, currency)}</tbody></table>`
        : `<div class="empty">No earning lines were recorded in the locked payroll ledger.</div>`
    }
  </div>

  ${
    deductions.length
      ? `
      <div class="section">
        <h2>Employee deductions</h2>
        <table>
          <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
          <tbody>${moneyRows(deductions, currency)}</tbody>
        </table>
      </div>`
      : ''
  }

  ${
    employerContributions.length
      ? `
      <div class="section">
        <h2>Employer contributions</h2>
        <table>
          <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
          <tbody>${moneyRows(employerContributions, currency)}</tbody>
          <tfoot><tr><td><strong>Total employer contributions</strong></td><td class="amount">${formatMoney(employerContributionTotal, currency)}</td></tr></tfoot>
        </table>
      </div>`
      : ''
  }

  <div class="net-banner">
    <div>
      <div class="muted">Actual amount payable to employee</div>
      <div class="small">Net pay for this payroll period</div>
    </div>
    <div class="amount">${formatMoney(payroll.netPay, currency)}</div>
  </div>

  ${
    payslip.notes
      ? `<div class="section card"><h2>Notes</h2><div>${esc(payslip.notes)}</div></div>`
      : ''
  }

  <div class="footer">
    <span>Generated by DeluxHR from locked payroll snapshot v${esc(payslip.snapshotVersion ?? 1)}</span>
    <span>Generated ${formatDate(payslip.generatedAt)}</span>
  </div>
</body>
</html>`;
}
