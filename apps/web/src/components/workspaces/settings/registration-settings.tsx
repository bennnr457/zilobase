import { useInstanceSettings, useUpdateInstanceSettings } from "@zilobase/features/instance/react";
import type { RegistrationMode } from "@zilobase/features/instance";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RegistrationSettingsSection() {
  const settingsQuery = useInstanceSettings();
  const updateSettings = useUpdateInstanceSettings();
  const save = (value: RegistrationMode) =>
    updateSettings.mutate(value, {
      onSuccess: () => toast.success("Registration settings updated."),
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update registration settings.",
        ),
    });

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">Server registration</h3>
        <p className="text-sm text-content-secondary">
          Choose who can create an account on this self-hosted server.
        </p>
      </div>
      <Field>
        <FieldLabel>Registration mode</FieldLabel>
        <Select
          disabled={settingsQuery.isLoading || updateSettings.isPending}
          onValueChange={(value) => save(value as RegistrationMode)}
          value={settingsQuery.data?.settings.registrationMode ?? ""}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Loading registration mode..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invite-only">Invite only</SelectItem>
            <SelectItem value="open">Open registration</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>
          Invite only requires a pending invitation. Open registration adds every verified account
          to this workspace as a member.
        </FieldDescription>
        {settingsQuery.isError ? (
          <FieldError>
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Could not load registration settings."}
          </FieldError>
        ) : null}
      </Field>
    </section>
  );
}
