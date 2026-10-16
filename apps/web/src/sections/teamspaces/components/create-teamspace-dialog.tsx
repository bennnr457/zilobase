import { getTeamspaceCreationInput } from "@zilobase/features/teamspaces";
import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Spinner } from "@/components/ui/spinner";

import { Textarea } from "@/components/ui/textarea";

import { getApiErrorMessage } from "@/platform/network/api";

import { type TeamspaceAccessMode } from "@zilobase/features/teamspaces";
import { useCreateTeamspace } from "@zilobase/features/teamspaces/react";

export function CreateTeamspaceDialog({
  open,
  onOpenChange,
  workspaceId,
  idPrefix = "teamspace",
}: {
  open: boolean;
  idPrefix?: string;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null | undefined;
}) {
  const create = useCreateTeamspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<TeamspaceAccessMode>("closed");

  const submit = () => {
    const input = getTeamspaceCreationInput({
      accessMode,
      description,
      name,
      workspaceId,
    });
    if (!input) return;
    create.mutate(input, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSuccess: () => {
        toast.success("Teamspace created.");
        setName("");
        setDescription("");
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New teamspace</DialogTitle>
          <DialogDescription>Create a dedicated home for a team or project.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input
              id={`${idPrefix}-name`}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-description`}>Description</Label>
            <Textarea
              id={`${idPrefix}-description`}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
          <div className="grid gap-2">
            <Label>Access</Label>
            <Select
              onValueChange={(value) => setAccessMode(value as TeamspaceAccessMode)}
              value={accessMode}
            >
              <SelectTrigger aria-label="Teamspace access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open — anyone can join</SelectItem>
                <SelectItem value="closed">Closed — members join by invite</SelectItem>
                <SelectItem value="private">Private — visible only to members</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!name.trim() || create.isPending} onClick={submit}>
            {create.isPending ? <Spinner /> : null}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
