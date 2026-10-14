import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/shared/ui/button";
import { ZilobaseLogo } from "@/shared/components/zilobase-logo";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { getApiErrorMessage } from "@/platform/network/api";
import { cn } from "@/shared/lib/utils";
import { useCreateWorkspace } from "@zilobase/features/workspaces/react";
import posthog from "@/shared/lib/posthog";
("use client");

export function OnboardingForm({ className, ...props }: React.ComponentProps<"div">) {
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const workspaceName = String(formData.get("workspaceName") ?? "").trim();

    try {
      await createWorkspace.mutateAsync(workspaceName);
      posthog?.capture("workspace_created");
      void navigate({ to: "/recents" });
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a href="#" className="flex flex-col items-center gap-2 font-medium">
              <ZilobaseLogo className="h-8 w-auto" />
              <span className="sr-only">Zilobase</span>
            </a>
            <h1 className="text-xl font-bold">Set up your page</h1>
            <FieldDescription>Tell us what to call your workspace.</FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
            <Input
              id="workspace-name"
              name="workspaceName"
              type="text"
              placeholder="Acme Inc."
              autoComplete="workspace"
              disabled={createWorkspace.isPending}
              required
            />
          </Field>
          {createWorkspace.isError && (
            <FieldError>{getApiErrorMessage(createWorkspace.error)}</FieldError>
          )}
          <Field>
            <Button type="submit" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending ? "Creating page..." : "Continue"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-surface-canvas p-6 md:p-10">
      <div className="w-full max-w-sm">
        <OnboardingForm />
      </div>
    </div>
  );
}
