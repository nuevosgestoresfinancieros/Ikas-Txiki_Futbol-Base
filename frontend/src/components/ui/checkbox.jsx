import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-5 w-5 shrink-0 rounded-md border-2 border-[#93C8EE] bg-white shadow-sm transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5EA8DC]/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[#2F7EBE] data-[state=checked]:bg-[#2F7EBE] data-[state=checked]:text-white",
      className
    )}
    {...props}>
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
