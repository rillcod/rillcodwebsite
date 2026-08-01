'use client';
import { useEffect, useState } from 'react';
import { MOBILE_PAGE_ROOT } from '@/components/mobile/mobile-styles';

export default function Page() {
 const [text,setText]=useState('');
 const [note,setNote]=useState('Loading...');
 useEffect(()=>{fetch('/api/admin/report-policy').then(r=>r.json()).then(r=>{setText(JSON.stringify(r.policy,null,2));setNote(r.error||'')})},[]);
 async function save(){
  try{
   const result=await fetch('/api/admin/report-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:JSON.parse(text)})}).then(r=>r.json());
   setNote(result.error||'Policy saved. New and refreshed drafts will use it.');
  }catch{setNote('Correct the invalid JSON before saving.');}
 }
 return <ReportPolicyForm text={text} note={note} setText={setText} save={save}/>;
}
function ReportPolicyForm(p:any){
 return (
  <main className={`max-w-4xl mx-auto p-4 sm:p-6 space-y-4 ${MOBILE_PAGE_ROOT}`}>
   <h1 className="text-xl font-black text-foreground">School report policy</h1>
   <textarea className="w-full min-h-[320px] rounded-xl border border-border bg-card p-3 font-mono text-sm" value={p.text} onChange={e=>p.setText(e.target.value)}/>
   <button type="button" onClick={p.save} className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Validate and save</button>
   <p className="text-sm text-muted-foreground">{p.note}</p>
  </main>
 );
}
