// Suggestion composition: https://ui.shadcn.com/docs/ai-elements/radix/suggestion
import { Button } from "@/components/ui/button";

export function ChatEmptyState({
  name,
  onSelect,
}: {
  name?: string | null;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto mb-6 grid w-full max-w-3xl justify-items-center gap-3 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-lg font-semibold">
        AI
      </div>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{getGreeting(name)}</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Attach pages and databases to ask questions about your workspace.
        </p>
      </div>
      <div className="flex max-w-2xl flex-wrap justify-center gap-2">
        {starterPrompts.map((prompt) => (
          <Button
            key={prompt}
            data-slot="suggestion"
            onClick={() => onSelect(prompt)}
            size="sm"
            type="button"
            variant="outline"
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}

function getGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

const starterPrompts = [
  "Summarize the attached pages",
  "What needs attention in these records?",
  "Create a project plan",
];
