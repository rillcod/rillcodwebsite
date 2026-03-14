// @refresh reset
'use client';

import React from 'react';
import { 
  CheckBadgeIcon, 
  PrinterIcon, 
  ArrowDownTrayIcon, 
  BanknotesIcon,
  BuildingOfficeIcon,
  UserIcon,
  CalendarDaysIcon,
  ShieldCheckIcon
} from '@/lib/icons';
import QRCode from 'react-qr-code';

interface DocumentItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface SmartDocumentProps {
  type: 'invoice' | 'receipt';
  data: {
    id?: string;
    number: string;
    date: string;
    dueDate?: string;
    status: string;
    items: DocumentItem[];
    amount: number;
    currency: string;
    notes?: string;
    studentName: string;
    studentEmail?: string;
    schoolName: string;
    schoolAddress?: string;
    instructorName?: string;
    transactionRef?: string;
    processingFee?: number;
    signatureUrl?: string;
  };
}

export default function SmartDocument({ type, data }: SmartDocumentProps) {
  const isReceipt = type === 'receipt';
  const currencySymbol = data.currency === 'NGN' ? '₦' : data.currency === 'USD' ? '$' : data.currency;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white text-slate-800 min-h-[1123px] w-[794px] mx-auto shadow-2xl relative overflow-hidden flex flex-col p-12 print:p-8 print:shadow-none font-sans">
      {/* Background Text Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] rotate-[-35deg] pointer-events-none select-none">
        <p className="text-[120px] font-black uppercase tracking-[0.2em]">{type}</p>
      </div>

      {/* Decorative patterns */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-slate-50 rounded-full -mr-32 -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-50 rounded-full -ml-48 -mb-48 pointer-events-none opacity-50" />
      
      {/* Header Section */}
      <div className="relative z-10 flex justify-between items-start mb-16">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-slate-100 p-2.5 overflow-hidden group hover:scale-105 transition-all duration-500">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none">Rillcod <span className="text-indigo-600">Academy</span></h1>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                <ShieldCheckIcon className="w-3 h-3 text-indigo-500" /> Authorized Learning Platform
              </p>
            </div>
          </div>
          
          <div className="pt-4">
            <div className="relative inline-block">
              <h2 className={`text-6xl font-black uppercase tracking-tighter ${isReceipt ? 'text-emerald-500' : 'text-slate-900'}`}>
                {type}
              </h2>
              {isReceipt && (
                <div className="absolute -right-12 -top-6 rotate-12 border-4 border-emerald-500/30 text-emerald-500/30 font-black px-4 py-1 rounded-xl text-xl uppercase tracking-widest select-none">
                  Paid
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Reference Number</span>
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{data.number}</span>
              </div>
              <div className="w-[1px] h-8 bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Issue Date</span>
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{data.date}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-right flex flex-col items-end gap-3">
          <div className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm border ${
            data.status === 'paid' || isReceipt 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
              : data.status === 'overdue' 
                ? 'bg-rose-50 border-rose-100 text-rose-700' 
                : 'bg-amber-50 border-amber-100 text-amber-700'
          }`}>
            {data.status}
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 max-w-[240px]">
            <p className="text-xs font-black text-slate-900 mb-1">{data.schoolName}</p>
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              {data.schoolAddress || 'Digital Learning Center, Abuja, Nigeria'}
            </p>
          </div>
        </div>
      </div>

      {/* Bill To / Info Grid */}
      <div className="relative z-10 grid grid-cols-2 gap-12 mb-12">
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Client Details</p>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 uppercase tracking-tight">{data.studentName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{data.studentEmail || 'student@rillcod.com'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Payment Info</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Due Date</p>
              <p className="text-xs font-bold text-slate-700">{data.dueDate || data.date}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Currency</p>
              <p className="text-xs font-bold text-slate-700">{data.currency} ({currencySymbol})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="relative z-10 flex-1 mb-12">
        <table className="w-full text-left">
          <thead>
            <tr className="border-y border-slate-100">
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Unit Price</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.items.map((item, idx) => (
              <tr key={idx} className="group">
                <td className="py-5">
                  <p className="text-sm font-extrabold text-slate-900 tracking-tight">{item.description}</p>
                </td>
                <td className="py-5 text-center">
                  <p className="text-sm font-bold text-slate-500">{item.quantity}</p>
                </td>
                <td className="py-5 text-right">
                  <p className="text-sm font-bold text-slate-500">{currencySymbol}{item.unit_price.toLocaleString()}</p>
                </td>
                <td className="py-5 text-right">
                  <p className="text-sm font-black text-slate-900">{currencySymbol}{item.total.toLocaleString()}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Section */}
      <div className="relative z-10 flex justify-between items-end mb-12">
        <div className="max-w-xs">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">Notes & Instructions</p>
          <p className="text-[11px] leading-relaxed text-slate-500 font-medium text-justify">
            {data.notes || 'Kindly clear all outstanding balances before the start of the next term. Payments can be made via card online or direct bank transfer to our Providus Bank account.'}
          </p>
        </div>

        <div className="w-64 space-y-3">
          <div className="flex justify-between items-center text-sm font-bold text-slate-400">
            <span>Subtotal</span>
            <span>{currencySymbol}{data.amount.toLocaleString()}</span>
          </div>
          {data.processingFee && data.processingFee > 0 && (
            <div className="flex justify-between items-center text-sm font-bold text-slate-400">
              <span className="flex items-center gap-1">
                Processing Fee
                <ShieldCheckIcon className="w-3 h-3 text-indigo-400" />
              </span>
              <span>{currencySymbol}{data.processingFee.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm font-bold text-slate-400">
            <span>Tax (0%)</span>
            <span>{currencySymbol}0</span>
          </div>
          <div className="pt-3 border-t-2 border-slate-900 flex justify-between items-baseline">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Amount</span>
            <span className="text-3xl font-black text-slate-900 tracking-tighter">
              {currencySymbol}{(data.amount + (data.processingFee || 0)).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer / QR Section */}
      <div className="mt-auto relative z-10 pt-10 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <QRCode value={`https://rillcod.com/v/${type}/${data.number}`} size={64} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1 flex items-center gap-2">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500" /> Authenticity Verified
            </p>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest max-w-[150px]">
              Scan to verify the validity of this {type} online.
            </p>
          </div>
        </div>

        <div className="text-right flex flex-col items-center">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">Authorized Signature</p>
          <div className="relative mb-2">
            <img 
              src={data.signatureUrl || '/images/signature.png'} 
              alt="Signature" 
              className="h-16 w-auto object-contain mix-blend-multiply brightness-90 contrast-125"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-48 h-[1px] bg-slate-200" />
          </div>
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{data.instructorName || 'Accounts Department'}</p>
        </div>
      </div>

      {/* Action Buttons (Hidden on Print) */}
      <div className="fixed bottom-8 right-8 flex gap-3 print:hidden">
        <button 
          onClick={handlePrint}
          className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all group"
        >
          <PrinterIcon className="w-6 h-6" />
          <span className="absolute right-full mr-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">Print / PDF</span>
        </button>
      </div>

      {/* Footer Branding */}
      <div className="mt-12 text-center">
        <p className="text-[8px] font-black text-slate-200 uppercase tracking-[0.6em]">System Generated • Rillcod Finance Engine v1.0</p>
      </div>
    </div>
  );
}
