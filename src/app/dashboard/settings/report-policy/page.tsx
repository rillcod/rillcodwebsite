'use client';
import {useEffect,useState} from 'react';
export default function Page(){
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
function ReportPolicyForm(p:any){return <main><h1>School report policy</h1><textarea value={p.text} onChange={e=>p.setText(e.target.value)}/><button onClick={p.save}>Validate and save</button><p>{p.note}</p></main>}
