import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:pointer-events-none disabled:opacity-50 min-h-10 px-4 py-2",
  {
    variants: {
      variant: {
        default: "bg-stone-900 text-white hover:bg-stone-700",
        outline:
          "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
        destructive: "bg-red-700 text-white hover:bg-red-800",
        ghost: "text-stone-700 hover:bg-stone-100",
      },
      size: { default: "", sm: "min-h-9 px-3 text-xs", icon: "h-10 w-10 p-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
