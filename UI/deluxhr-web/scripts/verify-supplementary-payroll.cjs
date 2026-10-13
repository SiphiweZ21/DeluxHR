const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
process.env.NEXT_PUBLIC_API_BASE_URL='http://localhost:3000';
let index=0;
const cycles=[{id:'locked01-original',title:'Selected employee salary payroll',status:'LOCKED',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-31',_count:{payrollRuns:1}},{id:'open0002-supplementary',title:'Selected employee salary payroll · Batch 2',status:'CALCULATED',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-31',_count:{payrollRuns:1}}];
const original=Module._load;
Module._load=function(request){
 if(request==='react')return{...React,useEffect(){},useState(initial){const n=index++;return[n===0?[]:n===1?cycles:initial,()=>{}];}};
 if(request==='./layout/workspace-access')return{useWorkspaceAccess:()=>({access:{permissions:['MANAGE_PAYROLL','REVIEW_PAYROLL','APPROVE_PAYROLL'].map(permission=>({permission,scope:'ORGANIZATION'}))}})};
 if(request==='next/link')return{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
 return original.apply(this,arguments);
};
try{
 const {SalaryPayroll}=require('../src/components/salary-payroll.tsx');
 const html=renderToStaticMarkup(React.createElement(SalaryPayroll,{onChanged:async()=>{}}));
 assert(html.includes('id="cycle-locked01-original"'));assert(html.includes('id="cycle-open0002-supplementary"'));
 assert(html.includes('Batch reference LOCKED01'));assert(html.includes('Batch reference OPEN0002'));assert(html.includes('Batch 2'));
 const first=html.split('id="cycle-locked01-original"')[1].split('</article>')[0];
 const second=html.split('id="cycle-open0002-supplementary"')[1].split('</article>')[0];
 assert(first.includes('Prepare payment batch'));assert(!first.includes('Review cycle'));assert(second.includes('Review cycle'));assert(!second.includes('Prepare payment batch'));
 assert(html.includes('a separate batch is created for additional employees'));
 console.log('Passed same-period batch visibility, references, locked/open actions and supplementary payroll guidance.');
}finally{Module._load=original;}
