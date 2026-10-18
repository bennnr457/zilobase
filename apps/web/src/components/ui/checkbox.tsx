import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { CheckIcon, MinusIcon } from "@/components/icons";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-control-border transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-action-danger-border aria-invalid:ring-2 aria-invalid:ring-action-danger-border aria-invalid:aria-checked:border-action-selected-border dark:bg-control-background dark:aria-invalid:border-action-danger-border dark:aria-invalid:ring-action-danger-border data-[state=indeterminate]:border-action-selected-border data-[state=indeterminate]:bg-action-selected data-[state=indeterminate]:text-action-on-selected dark:data-[state=indeterminate]:bg-action-selected data-checked:border-action-selected-border data-checked:bg-action-selected data-checked:text-action-on-selected dark:data-checked:bg-action-selected",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group/checkbox-indicator grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
          data-slot="checkbox-check"
          className="group-data-[state=indeterminate]/checkbox-indicator:hidden"
        />
        <MinusIcon
          data-slot="checkbox-indeterminate"
          className="hidden group-data-[state=indeterminate]/checkbox-indicator:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
