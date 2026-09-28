'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { bulkCreateEmployees, createEmployee, getDepartments, getEmployees, type BulkEmployeeInput, type Department, type Employee } from '../../lib/api';

function initials(employee: Employee) {
  return `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`.toUpperCase();
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkEmployeeInput[]>([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadPageData() {
    try {
      setIsLoading(true); setErrorMessage('');
      const [employeesData, departmentsData] = await Promise.all([getEmployees(), getDepartments()]);
      setEmployees(employeesData); setDepartments(departmentsData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load employees data.');
    } finally { setIsLoading(false); }
  }

  useEffect(() => { loadPageData(); }, []);

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const search = `${employee.firstName} ${employee.lastName} ${employee.email} ${employee.department?.name ?? ''}`.toLowerCase();
    const matchesSearch = search.includes(query.toLowerCase());
    const matchesDepartment = departmentFilter === 'ALL' || employee.departmentId === departmentFilter;
    return matchesSearch && matchesDepartment;
  }), [employees, query, departmentFilter]);

  const linkedToWhatsApp = employees.filter((e) => Boolean(e.whatsappNumber || e.phoneNumber)).length;
  const departmentCount = new Set(employees.map((e) => e.departmentId).filter(Boolean)).size;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrorMessage(''); setSuccessMessage('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phoneNumber.trim() || !departmentId) {
      setErrorMessage('First name, last name, email, mobile number, and department are required.'); return;
    }
    try {
      setIsSubmitting(true);
      const newEmployee = await createEmployee({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phoneNumber: phoneNumber.trim(), departmentId });
      const selectedDepartment = departments.find((d) => d.id === departmentId);
      setEmployees((current) => [{ ...newEmployee, department: selectedDepartment ? { id: selectedDepartment.id, name: selectedDepartment.name } : newEmployee.department }, ...current]);
      setFirstName(''); setLastName(''); setEmail(''); setPhoneNumber(''); setDepartmentId('');
      setSuccessMessage('Employee added to your workforce.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create employee.');
    } finally { setIsSubmitting(false); }
  }

  function downloadTemplate() {
    const csv = 'firstName,lastName,email,phoneNumber,whatsappNumber,department\nThandi,Ndlovu,thandi@company.co.za,27821234567,27821234567,Human Resources\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'deluxhr-employee-import-template.csv'; link.click(); URL.revokeObjectURL(url);
  }

  function handleBulkFile(file?: File) {
    if (!file) return;
    setBulkFileName(file.name); setBulkRows([]); setErrorMessage(''); setSuccessMessage('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result ?? '').replace(/\r/g, '').split('\n').filter(Boolean);
        const headers = lines.shift()?.split(',').map((h) => h.trim()) ?? [];
        const required = ['firstName','lastName','email','phoneNumber','department'];
        if (required.some((h) => !headers.includes(h))) throw new Error(`Template must include: ${required.join(', ')}`);
        const rows = lines.map((line, index) => {
          const values = line.split(',').map((v) => v.trim()); const row = Object.fromEntries(headers.map((h,i)=>[h, values[i] ?? '']));
          const department = departments.find((d) => d.name.toLowerCase() === String(row.department).toLowerCase());
          if (!department) throw new Error(`Row ${index + 2}: department "${row.department}" was not found in DeluxHR.`);
          if (!row.firstName || !row.lastName || !row.email || !row.phoneNumber) throw new Error(`Row ${index + 2}: required employee details are missing.`);
          return { firstName: row.firstName, lastName: row.lastName, email: row.email, phoneNumber: row.phoneNumber, whatsappNumber: row.whatsappNumber || row.phoneNumber, departmentId: department.id } as BulkEmployeeInput;
        });
        if (!rows.length) throw new Error('The CSV does not contain employee rows.');
        setBulkRows(rows); setSuccessMessage(`${rows.length} employee${rows.length === 1 ? '' : 's'} ready to import. Review the count, then import.`);
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Could not read the CSV file.'); }
    };
    reader.readAsText(file);
  }

  async function importBulkEmployees() {
    if (!bulkRows.length) return;
    try {
      setIsBulkImporting(true); setErrorMessage(''); setSuccessMessage('');
      const result = await bulkCreateEmployees(bulkRows);
      if (result.failed) { setErrorMessage(result.errors.map((e)=>`Row ${e.row}: ${e.message}`).join(' • ')); return; }
      setSuccessMessage(`${result.imported} employees imported successfully.`); setBulkRows([]); setBulkFileName(''); await loadPageData();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Bulk employee import failed.'); }
    finally { setIsBulkImporting(false); }
  }

  return <div className="space-y-7">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">People</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Employees</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A clear view of your workforce, contact details and department assignments.</p>
      </div>
      <div className="flex flex-wrap gap-2"><button onClick={downloadTemplate} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Download bulk template</button><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">Upload employees CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>handleBulkFile(e.target.files?.[0])}/></label><button onClick={loadPageData} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">Refresh</button></div>
    </section>

    <section className="grid gap-4 sm:grid-cols-3">
      {[['Total employees', employees.length, 'Active workforce records'], ['Departments', departmentCount, 'Teams represented'], ['WhatsApp ready', linkedToWhatsApp, 'Employees with a contact number']].map(([label,value,note]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p>
      </div>)}
    </section>

    {bulkFileName && <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-indigo-950">Bulk employee import</p><p className="mt-1 text-sm text-indigo-700">{bulkFileName} · {bulkRows.length} valid employee rows ready</p></div><div className="flex gap-2"><button onClick={()=>{setBulkRows([]);setBulkFileName('')}} className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700">Cancel</button><button disabled={!bulkRows.length||isBulkImporting} onClick={importBulkEmployees} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isBulkImporting?'Importing…':`Import ${bulkRows.length} employees`}</button></div></div></section>}

    <section className="grid gap-6 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-xl">＋</div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Add employee</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Create the employee profile and place them in the right team.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="Siphiwe" className="input" /></Field>
            <Field label="Last name"><input value={lastName} onChange={(e)=>setLastName(e.target.value)} placeholder="Zungu" className="input" /></Field>
          </div>
          <Field label="Work email"><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@company.co.za" className="input" /></Field><Field label="Mobile / WhatsApp"><input value={phoneNumber} onChange={(e)=>setPhoneNumber(e.target.value)} placeholder="27821234567" className="input" /></Field>
          <Field label="Department"><select value={departmentId} onChange={(e)=>setDepartmentId(e.target.value)} className="input"><option value="">Select department</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          {errorMessage && <Notice kind="error">{errorMessage}</Notice>}
          {successMessage && <Notice kind="success">{successMessage}</Notice>}
          <button disabled={isSubmitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60">{isSubmitting ? 'Adding employee…' : 'Add employee'}</button>
        </form>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="text-lg font-semibold text-slate-950">Employee directory</h2><p className="mt-1 text-sm text-slate-500">{filteredEmployees.length} of {employees.length} employees shown</p></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search name or email…" className="h-10 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-64" />
              <select value={departmentFilter} onChange={(e)=>setDepartmentFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"><option value="ALL">All departments</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
          </div>
        </div>
        {isLoading ? <Loading label="Loading employee directory…" /> : filteredEmployees.length === 0 ? <Empty title="No employees match this view" note="Try another search or add a new employee." /> : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3.5">Employee</th><th className="px-6 py-3.5">Department</th><th className="px-6 py-3.5">Contact</th><th className="px-6 py-3.5">Access</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredEmployees.map((employee)=><tr key={employee.id} className="transition hover:bg-slate-50/70"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">{initials(employee)}</div><div><p className="font-semibold text-slate-900">{employee.firstName} {employee.lastName}</p><p className="mt-0.5 text-xs text-slate-400">Employee record</p></div></div></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{employee.department?.name || 'Unassigned'}</span></td><td className="px-6 py-4"><p className="text-slate-700">{employee.email}</p><p className="mt-1 text-xs text-slate-400">{employee.whatsappNumber || employee.phoneNumber || 'No mobile number'}</p></td><td className="px-6 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${employee.userId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${employee.userId ? 'bg-emerald-500' : 'bg-amber-500'}`} />{employee.userId ? 'Account linked' : 'Employee only'}</span></td></tr>)}</tbody></table>
        </div>}
      </div>
    </section>
    <style jsx>{`.input{width:100%;border:1px solid rgb(226 232 240);border-radius:.75rem;background:white;padding:.72rem .9rem;font-size:.875rem;color:rgb(15 23 42);outline:none}.input:focus{border-color:rgb(129 140 248);box-shadow:0 0 0 3px rgb(224 231 255)}`}</style>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>; }
function Notice({kind,children}:{kind:'error'|'success';children:React.ReactNode}) { return <div className={`rounded-xl border px-4 py-3 text-sm ${kind==='error'?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
function Loading({label}:{label:string}) { return <div className="p-10 text-center text-sm text-slate-500">{label}</div>; }
function Empty({title,note}:{title:string;note:string}) { return <div className="m-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center"><p className="font-semibold text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{note}</p></div>; }
