"use client";

// Composition: https://ui.shadcn.com/docs/ai-elements/radix/prompt-input
// Layout sizes remain local so chat, editor popovers and database setup retain
// their existing geometry. Application callbacks own accepted text and errors.
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { CornerDownLeftIcon, SquareIcon, XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useRef, type ComponentProps, type FormEvent } from "react";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";
export interface PromptInputMessage {
  text: string;
  files: { type: "file"; mediaType: string; filename?: string; url: string }[];
}

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  inputGroupClassName?: string;
  getMessageText?: () => string;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({
  className,
  inputGroupClassName,
  getMessageText,
  onSubmit,
  children,
  ...props
}: PromptInputProps) {
  const submitting = useRef(false);
  return (
    <form
      className={cn("w-full", className)}
      {...props}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        const form = event.currentTarget;
        const field = form.elements.namedItem("message") as HTMLTextAreaElement | null;
        if (!field || field.disabled) return;
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submit?.disabled) return;
        const text = getMessageText?.() ?? field.value;
        if (!text.trim()) return;
        submitting.current = true;
        try {
          await onSubmit({ text, files: [] }, event);
        } catch {
          // The owner presents the error. Retain the captured draft for retry.
        } finally {
          submitting.current = false;
        }
      }}
    >
      <InputGroup className={cn("overflow-hidden bg-control-background", inputGroupClassName)}>
        {children}
      </InputGroup>
    </form>
  );
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;
export function PromptInputTextarea({
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) {
  const composing = useRef(false);
  return (
    <InputGroupTextarea
      {...props}
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      placeholder={placeholder}
      onCompositionStart={(event) => {
        composing.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onCompositionEnd?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.shiftKey ||
          composing.current ||
          event.nativeEvent.isComposing
        )
          return;
        event.preventDefault();
        const form = event.currentTarget.form;
        const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (!event.currentTarget.disabled && submit && !submit.disabled)
          form?.requestSubmit(submit);
      }}
    />
  );
}

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;
export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  );
}

export function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};
export function PromptInputSubmit({
  status,
  onStop,
  onClick,
  children,
  variant = "default",
  size = "icon-sm",
  ...props
}: PromptInputSubmitProps) {
  const generating = status === "submitted" || status === "streaming";
  const icon =
    status === "submitted" ? (
      <Spinner />
    ) : status === "streaming" ? (
      <SquareIcon className="size-4" />
    ) : status === "error" ? (
      <XIcon className="size-4" />
    ) : (
      <CornerDownLeftIcon className="size-4" />
    );
  return (
    <InputGroupButton
      {...props}
      variant={variant}
      size={size}
      aria-label={generating ? "Stop" : "Submit"}
      type={generating && onStop ? "button" : "submit"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && generating && onStop) {
          event.preventDefault();
          onStop();
        }
      }}
    >
      {children ?? icon}
    </InputGroupButton>
  );
}
