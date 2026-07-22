'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
export default function Page(){const {code}=useParams<{code:string}>();const[data,setData]=useState<any>();useEffect(()=>{fetch('/api/public/verify-school-report?code='+encodeURIComponent(code)).then(r=>r.json()).then(setData)},[code]);return <main><h1>Report verification</h1><pre>{JSON.stringify(data,null,2)}</pre></main>}
