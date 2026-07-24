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
  /** When set, copy and validation target the outstanding balance (pay-balance flow). */
  balanceMode?: {
    outstandingBalance: number;
    amountPaidSoFar: number;
  };
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
  balanceMode,
}: Props) {
  const hasError = attempted && settlement != null && !settlement.ok;
  const resolved = settlement?.ok ? settlement.settlement : null;
  const isBalanceMode = Boolean(balanceMode);

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
        {isBalanceMode ? (
          <>
            Outstanding balance: <strong className="text-foreground">{formatNairaAmount(balanceMode!.outstandingBalance)}</strong>.
            {" "}You may send <strong className="text-foreground">any amount up to the full balance</strong>.
          </>
        ) : (
          <>
            Total tuition: <strong className="text-foreground">{formatNairaAmount(totalTuition)}</strong>.
            {" "}Suggested {depositPercent}% deposit: <strong className="text-foreground">{formatNairaAmount(suggestedAmount)}</strong>.
            {" "}You may send <strong className="text-foreground">any amount up to the full tuition</strong> (including more than the deposit).
          </>
        )}
      </p>
      {hasError && settlement && !settlement.ok && (
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold text-destructive`}>{settlement.error}</p>
      )}
      {resolved && (
        <div className={`rounded-xl border p-3.5 ${
          resolved.balanceDue > 0
            ? "bg-amber-500/10 border-amber-500/30 dark:bg-amber-500/15"
            : "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/15"
        }`}>
          <p className={`${compact ? "text-[9px]" : "text-[10px]"} font-black uppercase tracking-widest ${
            resolved.balanceDue > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
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

