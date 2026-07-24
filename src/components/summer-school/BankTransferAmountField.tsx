"use client";

import {
  bankTransferBalanceMessage,
  formatNairaAmount,
  type BankTransferSettlement,
} from "@/lib/summer-school/bank-transfer-amount";

type Props = {
  value: string;
  onChange: (value: string) => void;
  attempted: boolean;
  totalTuition: number;
  suggestedAmount: number;
  depositPercent: number;
  settlement: { ok: true; settlement: BankTransferSettlement } | { ok: false; error: string } | null;
  labelCls: (err?: boolean) => string;
  inputCls: (err?: boolean) => string;
  compact?: boolean;
};

export function BankTransferAmountField({
  value,
  onChange,
  attempted,
  totalTuition,
  suggestedAmount,
  depositPercent,
  settlement,
  labelCls,
  inputCls,
  compact = false,
}: Props) {
  const hasError = attempted && settlement != null && !settlement.ok;
  const resolved = settlement?.ok ? settlement.settlement : null;

  return (
    <div className="space-y-2">
      <label className={labelCls(hasError)}>
        Amount you transferred (₦) *
      </label>
      <input
        type="text"
        inputMode="numeric"
        name="transferAmount"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,]/g, ""))}
        className={inputCls(hasError)}
        placeholder={`e.g. ${suggestedAmount.toLocaleString("en-NG")}`}
        required
      />
      <p className={`${compact ? "text-[9px]" : "text-[10px]"} text-muted-foreground leading-relaxed`}>
        Total tuition: <strong className="text-foreground">{formatNairaAmount(totalTuition)}</strong>.
        {" "}Suggested {depositPercent}% deposit: <strong className="text-foreground">{formatNairaAmount(suggestedAmount)}</strong>.
        {" "}You may send <strong className="text-foreground">any amount up to the full tuition</strong> (including more than the deposit).
      </p>
      {hasError && settlement && !settlement.ok && (
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold text-rose-500`}>{settlement.error}</p>
      )}
      {resolved && (
        <div className={`rounded-xl border p-3.5 ${
          resolved.balanceDue > 0
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-emerald-500/10 border-emerald-500/30"
        }`}>
          <p className={`${compact ? "text-[9px]" : "text-[10px]"} font-black uppercase tracking-widest ${
            resolved.balanceDue > 0 ? "text-amber-500" : "text-emerald-500"
          }`}>
            {resolved.balanceDue > 0 ? "Balance after verification" : "Full payment"}
          </p>
          <p className={`${compact ? "text-xs" : "text-sm"} font-black text-foreground mt-1`}>
            {resolved.balanceDue > 0
              ? formatNairaAmount(resolved.balanceDue)
              : formatNairaAmount(resolved.totalTuition)}
          </p>
          <p className={`${compact ? "text-[9px]" : "text-[10px]"} text-muted-foreground mt-1 leading-relaxed`}>
            {bankTransferBalanceMessage(resolved)}
          </p>
        </div>
      )}
    </div>
  );
}
