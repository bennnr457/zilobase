import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ChatLoading() {
  return (
    <p role="status" className="py-6 text-center text-sm text-content-secondary">
      Loading conversation…
    </p>
  );
}

export function ChatError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p role="alert" className={cn("mb-2 text-sm text-action-danger-text", className)} {...props} />
  );
}
