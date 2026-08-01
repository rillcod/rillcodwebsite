import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 aria-invalid:ring-destructive/15 aria-invalid:border-destructive flex field-sizing-content min-h-24 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base text-foreground shadow-sm transition-[border-color,box-shadow,background-color] outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
