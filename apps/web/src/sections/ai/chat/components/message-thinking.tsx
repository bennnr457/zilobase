// Reasoning pattern: https://ui.shadcn.com/docs/ai-elements/radix/reasoning
// A pending label is activity, not invented reasoning from the model.
import { Loader2Icon } from "@/components/icons";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";

export function MessageThinking({ label = "Thinking" }: { label?: string }) {
  return (
    <Trace role="status" aria-live="polite" aria-label={label}>
      <TraceLine status="running">
        <TraceIcon>
          <Loader2Icon className="motion-safe:animate-spin" />
        </TraceIcon>
        <TraceTitle>{label}</TraceTitle>
      </TraceLine>
    </Trace>
  );
}
