// Configuration catalog only. A specification is not evidence of a tested bank adapter.
export const BANKING_ADAPTERS = [
  {
    id: 'FNB_OBE_CSV',
    bank: 'FNB',
    channel: 'Online Banking Enterprise',
    format: 'CSV',
    version: 'SPEC_REVIEW',
    specification: 'DOCUMENTED',
    source:
      'https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/Payments.htm',
  },
  {
    id: 'FNB_OBE_BANKSERV',
    bank: 'FNB',
    channel: 'Online Banking Enterprise',
    format: 'Bankserv TXT',
    version: '2023-02',
    specification: 'DOCUMENTED',
    source:
      'https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/Payment_Bankserv_File_Format_SA.pdf',
  },
  {
    id: 'FNB_OBE_ISO',
    bank: 'FNB',
    channel: 'Online Banking Enterprise',
    format: 'pain.001.001.03 XML',
    version: '2020-11',
    specification: 'DOCUMENTED',
    source:
      'https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/Payment_ISO_File_Format_SA.pdf',
  },
  {
    id: 'STANDARD_BOL_MAPPED',
    bank: 'STANDARD_BANK',
    channel: 'Business Online mapped import',
    format: 'Mapped Excel',
    version: 'SPEC_REVIEW',
    specification: 'DOCUMENTED',
    source:
      'https://secure.businessonline.standardbank.co.za/bebhelp/Funds_Transfer/excel_help_col_mapping.html',
  },
  {
    id: 'STANDARD_H2H',
    bank: 'STANDARD_BANK',
    channel: 'Corporate Host-to-Host',
    format: 'Bank-agreed profile',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source:
      'https://www.businessonline.standardbank.co.za/bolsa/businessonline/products-and-services/channel-services/host-to-host-and-corporate-swift',
  },
  {
    id: 'NEDBANK_HUB',
    bank: 'NEDBANK',
    channel: 'Business Hub',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source:
      'https://business.nedbank.co.za/small-business/bank/digital-channels.html',
  },
  {
    id: 'NEDBANK_NETBANK',
    bank: 'NEDBANK',
    channel: 'NetBank Business',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source:
      'https://business.nedbank.co.za/small-business/bank/digital-channels.html',
  },
  {
    id: 'CAPITEC_BUSINESS',
    bank: 'CAPITEC',
    channel: 'Business banking payment upload',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source: 'https://www.capitecbank.co.za/business/transact/payment-services/',
  },
  {
    id: 'ABSA_BIO',
    bank: 'ABSA',
    channel: 'Business Integrator Online',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source: 'https://www.cib.absa.africa/corporate-banking/digital-channels/',
  },
  {
    id: 'ABSA_CASH_FOCUS',
    bank: 'ABSA',
    channel: 'Cash Focus',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source:
      'https://cib.absa.africa/wp-content/uploads/2022/07/SARS-Credit-Push-Info-Guide.pdf',
  },
  {
    id: 'INVESTEC_ONLINE',
    bank: 'INVESTEC',
    channel: 'Online manual upload',
    format: 'Bank-agreed format',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source: 'https://developer.investec.com/commercial-corporates',
  },
  {
    id: 'INVESTEC_H2H',
    bank: 'INVESTEC',
    channel: 'Commercial/Corporate Host-to-Host',
    format: 'Bank-agreed XML',
    version: 'SPEC_REQUIRED',
    specification: 'REQUIRED',
    source: 'https://developer.investec.com/commercial-corporates',
  },
] as const;
export function bankingCatalog() {
  return BANKING_ADAPTERS.map((a) => ({
    ...a,
    country: 'ZA',
    currency: 'ZAR',
    implementation:
      a.id === 'FNB_OBE_BANKSERV'
        ? 'IMPLEMENTED_FOR_TESTING'
        : 'NOT_IMPLEMENTED',
    bankImportReady: false,
  }));
}
export function bankingAdapter(id: string) {
  return BANKING_ADAPTERS.find((a) => a.id === id);
}
