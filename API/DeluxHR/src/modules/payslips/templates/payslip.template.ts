type PayslipViewModel = {
  payslipNumber: string;
  status: string;
  generatedAt: string;
  issuedAt?: string | null;
  notes?: string | null;
  organization?: {
    name?: string | null;
  } | null;
  employee?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  payroll?: {
    payPeriodStart?: string | Date | null;
    payPeriodEnd?: string | Date | null;
    paymentDate?: string | Date | null;
    currency?: string | null;
    grossEarnings?: number | null;
    totalDeductions?: number | null;
    taxableIncome?: number | null;
    taxAmount?: number | null;
    netPay?: number | null;
  } | null;
  earnings: Array<{
    title?: string | null;
    type?: string | null;
    amount?: number | null;
    units?: number | null;
    rate?: number | null;
  }>;
};

function formatDate(value?: string | Date | null) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatMoney(value?: number | null, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
  }).format(value ?? 0);
}

export function buildPayslipHtml(payslip: PayslipViewModel) {
  const currency = payslip.payroll?.currency ?? 'ZAR';

  const employeeName = `${payslip.employee?.firstName ?? ''} ${
    payslip.employee?.lastName ?? ''
  }`.trim();

  const earningsRows = payslip.earnings
    .map(
      (earning) => `
        <tr>
          <td>
            <strong>${earning.title ?? '-'}</strong>
            <div class="muted small">${earning.type ?? '-'}</div>
          </td>
          <td>${earning.units ?? '-'}</td>
          <td>${earning.rate ? formatMoney(earning.rate, currency) : '-'}</td>
          <td class="amount">${formatMoney(earning.amount, currency)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <html>
      <head>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
            padding: 32px;
            color: #0f172a;
            background: #ffffff;
          }

          .brand-header {
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            color: white;
            border-radius: 18px;
            padding: 28px;
            margin-bottom: 28px;
          }

          .brand-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .brand-name {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.03em;
          }

          .brand-subtitle {
            margin-top: 6px;
            color: #e0e7ff;
            font-size: 13px;
          }

          .payslip-label {
            text-align: right;
            font-size: 13px;
            color: #e0e7ff;
          }

          .payslip-number {
            margin-top: 6px;
            font-size: 18px;
            font-weight: 700;
            color: white;
          }

          .status-pill {
            display: inline-block;
            margin-top: 10px;
            padding: 6px 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.18);
            font-size: 12px;
            font-weight: 700;
          }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            margin-bottom: 22px;
          }

          .card {
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 18px;
            background: #ffffff;
          }

          .card-soft {
            background: #f8fafc;
          }

          h1, h2, h3 {
            margin: 0;
          }

          h2 {
            font-size: 15px;
            margin-bottom: 12px;
            color: #0f172a;
          }

          p {
            margin: 4px 0;
            font-size: 13px;
          }

          .label {
            color: #64748b;
            font-size: 12px;
          }

          .value {
            font-weight: 700;
            color: #0f172a;
          }

          .muted {
            color: #64748b;
          }

          .small {
            font-size: 11px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }

          .summary-card {
            border-radius: 14px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 14px;
          }

          .summary-card .label {
            margin-bottom: 8px;
          }

          .summary-card .amount {
            font-size: 16px;
            font-weight: 800;
          }

          .net-card {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }

          .net-card .label {
            color: #cbd5e1;
          }

          .net-card .amount {
            color: white;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 13px;
            overflow: hidden;
          }

          th {
            background: #f1f5f9;
            color: #475569;
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          td {
            padding: 13px 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
          }

          .amount {
            text-align: right;
            font-weight: 700;
          }

          .section {
            margin-bottom: 24px;
          }

          .footer {
            margin-top: 32px;
            border-top: 1px solid #e2e8f0;
            padding-top: 14px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>

      <body>
        <div class="brand-header">
          <div class="brand-row">
            <div>
              <div class="brand-name">DeluxHR</div>
              <div class="brand-subtitle">
                Modern HR platform for SMEs — workforce intelligence and payroll
              </div>
            </div>

            <div class="payslip-label">
              Payslip
              <div class="payslip-number">${payslip.payslipNumber}</div>
              <div class="status-pill">${payslip.status}</div>
            </div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h2>Company</h2>
            <p class="label">Organization</p>
            <p class="value">${payslip.organization?.name ?? '-'}</p>
          </div>

          <div class="card">
            <h2>Employee</h2>
            <p class="label">Name</p>
            <p class="value">${employeeName || '-'}</p>
            <p class="label">Email</p>
            <p>${payslip.employee?.email ?? '-'}</p>
          </div>
        </div>

        <div class="card card-soft section">
          <h2>Payroll Period</h2>
          <div class="grid" style="margin-bottom: 0;">
            <div>
              <p class="label">Period</p>
              <p class="value">
                ${formatDate(payslip.payroll?.payPeriodStart)} - ${formatDate(
                  payslip.payroll?.payPeriodEnd,
                )}
              </p>
            </div>
            <div>
              <p class="label">Payment Date</p>
              <p class="value">${formatDate(payslip.payroll?.paymentDate)}</p>
            </div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <p class="label">Gross Earnings</p>
            <p class="amount">${formatMoney(
              payslip.payroll?.grossEarnings,
              currency,
            )}</p>
          </div>

          <div class="summary-card">
            <p class="label">Tax Amount</p>
            <p class="amount">${formatMoney(
              payslip.payroll?.taxAmount,
              currency,
            )}</p>
          </div>

          <div class="summary-card">
            <p class="label">Deductions</p>
            <p class="amount">${formatMoney(
              payslip.payroll?.totalDeductions,
              currency,
            )}</p>
          </div>

          <div class="summary-card net-card">
            <p class="label">Net Pay</p>
            <p class="amount">${formatMoney(
              payslip.payroll?.netPay,
              currency,
            )}</p>
          </div>
        </div>

        <div class="section">
          <h2>Earnings Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Units</th>
                <th>Rate</th>
                <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                earningsRows ||
                `<tr><td colspan="4">No earnings found.</td></tr>`
              }
            </tbody>
          </table>
        </div>

        ${
          payslip.notes
            ? `
              <div class="card section">
                <h2>Notes</h2>
                <p>${payslip.notes}</p>
              </div>
            `
            : ''
        }

        <div class="footer">
          <span>Generated by DeluxHR</span>
          <span>Generated: ${formatDate(payslip.generatedAt)}</span>
        </div>
      </body>
    </html>
  `;
}