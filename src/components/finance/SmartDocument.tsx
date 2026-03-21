// @refresh reset
'use client';

import React, { useState } from 'react';
import {
  CheckBadgeIcon,
  PrinterIcon,
  ShieldCheckIcon,
  UserIcon,
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
  defaultTemplate?: 'classic' | 'bold';
}

export default function SmartDocument({ type, data, defaultTemplate = 'classic' }: SmartDocumentProps) {
  const isReceipt = type === 'receipt';
  const currencySymbol = data.currency === 'NGN' ? '₦' : data.currency === 'USD' ? '$' : data.currency;
  const [template, setTemplate] = useState<'classic' | 'bold'>(defaultTemplate);

  const handlePrint = () => {
    window.print();
  };

  const accentColor = isReceipt
    ? (template === 'bold' ? '#10b981' : '#059669')
    : (template === 'bold' ? '#f59e0b' : '#4f46e5');

  return (
    <>
      {/* Template Selector — hidden on print */}
      <div className="print:hidden flex justify-center gap-0 mb-4">
        <button
          onClick={() => setTemplate('classic')}
          className={`px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
            template === 'classic'
              ? 'bg-white text-slate-900 border-slate-300 shadow'
              : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600'
          }`}
        >
          Classic
        </button>
        <button
          onClick={() => setTemplate('bold')}
          className={`px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-y border-r ${
            template === 'bold'
              ? isReceipt ? 'bg-emerald-600 text-white border-emerald-600 shadow' : 'bg-amber-500 text-white border-amber-500 shadow'
              : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600'
          }`}
        >
          Bold
        </button>
      </div>

      {/* Document — fixed A4 width, scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          className={`relative min-h-[1123px] w-[794px] mx-auto shadow-2xl flex flex-col p-12 print:p-8 print:shadow-none font-sans ${
            template === 'bold'
              ? isReceipt
                ? 'bg-[#0a1a14] text-white'
                : 'bg-[#0f0f1f] text-white'
              : 'bg-white text-slate-800'
          }`}
        >
          {/* Background watermark */}
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none ${
            template === 'bold' ? 'opacity-[0.04]' : 'opacity-[0.03]'
          } rotate-[-35deg]`}>
            <p className="text-[120px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>{type}</p>
          </div>

          {/* Decorative — template specific */}
          {template === 'classic' ? (
            <>
              <div className="absolute top-0 right-0 w-80 h-80 bg-slate-50 rounded-full -mr-32 -mt-32 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-50 rounded-full -ml-48 -mb-48 pointer-events-none opacity-50" />
            </>
          ) : (
            <>
              <div className="absolute top-0 left-0 w-full h-1 pointer-events-none" style={{ background: accentColor }} />
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full -mr-24 -mt-24 pointer-events-none opacity-10" style={{ background: accentColor }} />
              <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full -ml-16 -mb-16 pointer-events-none opacity-10" style={{ background: accentColor }} />
            </>
          )}

          {/* ── Header ── */}
          <div className="relative z-10 flex justify-between items-start mb-16">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 flex items-center justify-center shadow-xl overflow-hidden group hover:scale-105 transition-all duration-500 ${
                  template === 'bold' ? 'bg-white/10 border border-white/20 rounded-2xl p-2.5' : 'bg-white rounded-2xl border border-slate-100 p-2.5'
                }`}>
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h1 className={`text-2xl font-black uppercase tracking-tighter leading-none ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>
                    Rillcod <span style={{ color: accentColor }}>Academy</span>
                  </h1>
                  <p className={`text-[9px] font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2 ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>
                    <span style={{ color: accentColor }}><ShieldCheckIcon className="w-3 h-3" /></span> Authorized Learning Platform
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <div className="relative inline-block">
                  <h2 className={`text-6xl font-black uppercase tracking-tighter`} style={{ color: accentColor }}>
                    {type}
                  </h2>
                  {isReceipt && (
                    <div className={`absolute -right-12 -top-6 rotate-12 font-black px-4 py-1 rounded-xl text-xl uppercase tracking-widest select-none border-4 ${
                      template === 'bold' ? 'border-white/20 text-white/20' : ''
                    }`} style={template === 'classic' ? { border: `3px solid ${accentColor}44`, color: `${accentColor}44` } : undefined}>
                      Paid
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex flex-col">
                    <span className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Reference Number</span>
                    <span className={`text-xs font-black uppercase tracking-widest ${template === 'bold' ? 'text-white/70' : 'text-slate-600'}`}>{data.number}</span>
                  </div>
                  <div className={`w-[1px] h-8 ${template === 'bold' ? 'bg-white/10' : 'bg-slate-100'}`} />
                  <div className="flex flex-col">
                    <span className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Issue Date</span>
                    <span className={`text-xs font-black uppercase tracking-widest ${template === 'bold' ? 'text-white/70' : 'text-slate-600'}`}>{data.date}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right flex flex-col items-end gap-3">
              <div className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm border ${
                data.status === 'paid' || isReceipt
                  ? template === 'bold' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : data.status === 'overdue'
                    ? template === 'bold' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-100 text-rose-700'
                    : template === 'bold' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-100 text-amber-700'
              }`}>
                {data.status}
              </div>
              <div className={`p-4 rounded-2xl border max-w-[240px] ${template === 'bold' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-xs font-black mb-1 ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>{data.schoolName}</p>
                <p className={`text-[10px] leading-relaxed font-medium ${template === 'bold' ? 'text-white/50' : 'text-slate-500'}`}>
                  {data.schoolAddress || 'Digital Learning Center, Abuja, Nigeria'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Bill To / Info Grid ── */}
          <div className="relative z-10 grid grid-cols-2 gap-12 mb-12">
            <div className="space-y-4">
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] border-b pb-2 ${template === 'bold' ? 'text-white/30 border-white/10' : 'text-slate-300 border-slate-100'}`}>Client Details</p>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${template === 'bold' ? 'bg-white/10 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
                  <UserIcon className={`w-5 h-5 ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`} />
                </div>
                <div>
                  <p className={`font-extrabold uppercase tracking-tight ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>{data.studentName}</p>
                  <p className={`text-xs mt-0.5 ${template === 'bold' ? 'text-white/50' : 'text-slate-500'}`}>{data.studentEmail || 'student@rillcod.com'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] border-b pb-2 ${template === 'bold' ? 'text-white/30 border-white/10' : 'text-slate-300 border-slate-100'}`}>Payment Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Due Date</p>
                  <p className={`text-xs font-bold ${template === 'bold' ? 'text-white/70' : 'text-slate-700'}`}>{data.dueDate || data.date}</p>
                </div>
                <div>
                  <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Currency</p>
                  <p className={`text-xs font-bold ${template === 'bold' ? 'text-white/70' : 'text-slate-700'}`}>{data.currency} ({currencySymbol})</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Items Table ── */}
          <div className="relative z-10 flex-1 mb-12">
            <table className="w-full text-left">
              <thead>
                <tr className={`border-y ${template === 'bold' ? 'border-white/10' : 'border-slate-100'}`}>
                  <th className={`py-4 text-[10px] font-black uppercase tracking-widest ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>Description</th>
                  <th className={`py-4 text-[10px] font-black uppercase tracking-widest text-center ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>Qty</th>
                  <th className={`py-4 text-[10px] font-black uppercase tracking-widest text-right ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>Unit Price</th>
                  <th className={`py-4 text-[10px] font-black uppercase tracking-widest text-right ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>Total</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${template === 'bold' ? 'divide-white/5' : 'divide-slate-50'}`}>
                {data.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-5">
                      <p className={`text-sm font-extrabold tracking-tight ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>{item.description}</p>
                    </td>
                    <td className="py-5 text-center">
                      <p className={`text-sm font-bold ${template === 'bold' ? 'text-white/50' : 'text-slate-500'}`}>{item.quantity}</p>
                    </td>
                    <td className="py-5 text-right">
                      <p className={`text-sm font-bold ${template === 'bold' ? 'text-white/50' : 'text-slate-500'}`}>{currencySymbol}{item.unit_price.toLocaleString()}</p>
                    </td>
                    <td className="py-5 text-right">
                      <p className={`text-sm font-black ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>{currencySymbol}{item.total.toLocaleString()}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Summary ── */}
          <div className="relative z-10 flex justify-between items-end mb-12">
            <div className="max-w-xs">
              <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Notes & Instructions</p>
              <p className={`text-[11px] leading-relaxed font-medium text-justify ${template === 'bold' ? 'text-white/50' : 'text-slate-500'}`}>
                {data.notes || 'Kindly clear all outstanding balances before the start of the next term. Payments can be made via card online or direct bank transfer to our Providus Bank account.'}
              </p>
            </div>

            <div className="w-64 space-y-3">
              <div className={`flex justify-between items-center text-sm font-bold ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>
                <span>Subtotal</span>
                <span>{currencySymbol}{data.amount.toLocaleString()}</span>
              </div>
              {data.processingFee && data.processingFee > 0 && (
                <div className={`flex justify-between items-center text-sm font-bold ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    Processing Fee <span style={{ color: accentColor }}><ShieldCheckIcon className="w-3 h-3" /></span>
                  </span>
                  <span>{currencySymbol}{data.processingFee.toLocaleString()}</span>
                </div>
              )}
              <div className={`flex justify-between items-center text-sm font-bold ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>
                <span>Tax (0%)</span>
                <span>{currencySymbol}0</span>
              </div>
              <div className={`pt-3 border-t-2 flex justify-between items-baseline ${template === 'bold' ? 'border-white/20' : 'border-slate-900'}`}>
                <span className={`text-[10px] font-black uppercase tracking-widest ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>Total Amount</span>
                <span className={`text-3xl font-black tracking-tighter ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>
                  {currencySymbol}{(data.amount + (data.processingFee || 0)).toLocaleString()}
                </span>
              </div>
              {template === 'bold' && (
                <div className="pt-2 rounded-xl p-4 text-center" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
                  <p className="text-2xl font-black" style={{ color: accentColor }}>
                    {isReceipt ? '✓ PAID' : data.status.toUpperCase()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer / QR ── */}
          <div className={`mt-auto relative z-10 pt-10 border-t flex items-center justify-between ${template === 'bold' ? 'border-white/10' : 'border-slate-100'}`}>
            <div className="flex items-center gap-8">
              <div className={`p-3 rounded-2xl shadow-sm ${template === 'bold' ? 'bg-white' : 'bg-white border border-slate-100'}`}>
                <QRCode value={`https://rillcod.com/v/${type}/${data.number}`} size={64} />
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2 ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500" /> Authenticity Verified
                </p>
                <p className={`text-[9px] uppercase tracking-widest max-w-[150px] ${template === 'bold' ? 'text-white/40' : 'text-slate-400'}`}>
                  Scan to verify the validity of this {type} online.
                </p>
              </div>
            </div>

            <div className="text-right flex flex-col items-center">
              <p className={`text-[9px] font-black uppercase tracking-[0.3em] mb-2 ${template === 'bold' ? 'text-white/30' : 'text-slate-300'}`}>Authorized Signature</p>
              <div className="relative mb-2">
                <img
                  src={data.signatureUrl || '/images/signature.png'}
                  alt="Signature"
                  className={`h-16 w-auto object-contain ${template === 'bold' ? 'invert brightness-[200%]' : 'mix-blend-multiply brightness-90 contrast-125'}`}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-48 h-[1px] ${template === 'bold' ? 'bg-white/20' : 'bg-slate-200'}`} />
              </div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${template === 'bold' ? 'text-white' : 'text-slate-900'}`}>{data.instructorName || 'Accounts Department'}</p>
            </div>
          </div>

          {/* ── Footer Branding ── */}
          <div className="mt-12 text-center">
            <p className={`text-[8px] font-black uppercase tracking-[0.6em] ${template === 'bold' ? 'text-white/20' : 'text-slate-200'}`}>System Generated • Rillcod Finance Engine v1.0</p>
          </div>
        </div>
      </div>

      {/* Print / Action Buttons — hidden on print */}
      <div className="fixed bottom-8 right-8 flex gap-3 print:hidden">
        <button
          onClick={handlePrint}
          className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all group"
        >
          <PrinterIcon className="w-6 h-6" />
          <span className="absolute right-full mr-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">Print / PDF</span>
        </button>
      </div>
    </>
  );
}
