import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[108px] w-full rounded-xl border border-input bg-white px-3 py-3 text-base shadow-[0_2px_8px_rgba(14,53,84,0.04)] transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-[#5EA8DC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5EA8DC]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
