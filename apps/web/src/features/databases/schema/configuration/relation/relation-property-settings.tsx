import { createDatabaseRelationCommands } from "@zilobase/features/databases";
import { getRelationConfig } from "@zilobase/features/databases";
import {
  ArrowUpRight,
  ChevronLeft,
  CircleHelp,
  Database,
  Hash,
  Plus,
} from "@/shared/components/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { DropDrawerItem, DropDrawerSeparator } from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Switch } from "@/shared/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  useAddDatabaseProperty,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases/react";
import { usePageNavigation } from "@zilobase/features/pages/react";

import {
  PageDatabasePicker,
  type PageDatabasePickerOption,
} from "../../../components/page-database-picker";
import type { DatabasePropertyConfig } from "@zilobase/features/databases";
import { useDatabaseMetadata } from "@zilobase/features/databases/react";
import { useDatabaseSecondaryPayload } from "@zilobase/features/databases/react";
import { getRelationNeedsRepair, relationPayloadFromViewData } from "@zilobase/features/databases";

type RelationDatabaseOption = PageDatabasePickerOption & {
  pageName: string;
};

export function RelationPropertySettings({
  config,
  databaseId,
  databasePropertyId,
  onUpdateConfig,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  workspaceId,
}: {
  config?: unknown;
  databaseId: string;
  databasePropertyId: string;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  sourceDatabaseId: string;
  sourceDatabaseName?: string;
  sourcePropertyId?: string;
  workspaceId?: string | null;
}) {
  const navigate = useNavigate();
  const relationConfig = getRelationConfig(config);
  const addProperty = useAddDatabaseProperty();
  const updateProperty = useUpdateDatabaseProperty();
  const updateValue = useUpdateDatabasePropertyValue();
  const relationCommands = createDatabaseRelationCommands({
    addProperty,
    updateProperty,
    updateValue,
  });
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [repairPrimarySource, setRepairPrimarySource] = useState<"source" | "related">("source");
  const [optimisticTwoWayRelation, setOptimisticTwoWayRelation] = useState<boolean | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    relationConfig.relatedDatabaseId ?? null,
  );
  const [relatedPropertyName, setRelatedPropertyName] = useState(
    relationConfig.relatedPropertyName ?? "",
  );
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    enabled: Boolean(workspaceId),
  });
  const { data: relatedDatabaseSchema } = useDatabaseMetadata(selectedDatabaseId);
  const pagesById = new Map((navigation?.pages ?? []).map((page) => [page.id, page]));
  const databaseOptions = (navigation?.databases ?? [])
    .filter((database) => database.id !== sourceDatabaseId)
    .map<RelationDatabaseOption>((database) => {
      const pageName = database.pageId
        ? pagesById.get(database.pageId)?.name || "Untitled"
        : "Standalone";

      return {
        description: pageName,
        icon: <Database />,
        label: database.name || "Untitled database",
        pageName,
        searchText: `${database.name} ${pageName}`.trim(),
        value: database.id,
      };
    });
  const selectedDatabase = selectedDatabaseId
    ? databaseOptions.find((option) => option.value === selectedDatabaseId)
    : null;
  const limit = relationConfig.limit ?? "no_limit";
  const twoWayRelation = optimisticTwoWayRelation ?? relationConfig.twoWayRelation ?? false;
  const relationCreated = relationConfig.relatedDatabaseId === selectedDatabaseId;
  const needsRepair = getRelationNeedsRepair({
    propertyConfig: config,
    relatedDatabasePayload: relatedDatabaseSchema,
  });
  const currentDatabaseRead = useDatabaseSecondaryPayload(sourceDatabaseId, {
    enabled: repairDialogOpen,
    loadAll: true,
  });
  const relatedDatabaseRead = useDatabaseSecondaryPayload(selectedDatabaseId, {
    enabled: repairDialogOpen,
    loadAll: true,
  });
  const repairDataLoading =
    repairDialogOpen && (!currentDatabaseRead.isComplete || !relatedDatabaseRead.isComplete);

  useEffect(() => {
    setOptimisticTwoWayRelation(null);
  }, [relationConfig.twoWayRelation]);

  const repairRelations = () => {
    if (repairDataLoading) {
      return;
    }
    const repaired = relationCommands.repair({
      databaseId,
      databasePropertyId,
      payload: relationPayloadFromViewData(currentDatabaseRead.data),
      primarySource: repairPrimarySource,
      propertyConfig: config,
      relatedDatabasePayload: relationPayloadFromViewData(relatedDatabaseRead.data),
    });
    if (repaired) setRepairDialogOpen(false);
  };
  const saveRelation = () =>
    relationCommands.save(
      {
        selectedDatabase,
        relationConfig,
        relatedPropertyName,
        twoWayRelation,
        limit,
        sourceDatabaseId,
        sourceDatabaseName,
        sourcePropertyId,
      },
      onUpdateConfig,
    );

  if (selectedDatabase) {
    return (
      <>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            setSelectedDatabaseId(null);
          }}
        >
          <ChevronLeft />
          <span>Back</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DropDrawerItem
                className="text-content-secondary"
                onSelect={() =>
                  void navigate({
                    params: { databaseId: selectedDatabase.value },
                    search: { view: undefined },
                    to: "/d/$databaseId",
                  })
                }
              >
                <Database />
                <span>Related to</span>
                <span className="ml-auto max-w-36 truncate text-content-secondary">
                  {selectedDatabase.label}
                </span>
              </DropDrawerItem>
            </div>
          </TooltipTrigger>
          <TooltipContent>A related database cannot be changed after creation</TooltipContent>
        </Tooltip>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            onUpdateConfig({
              relation: {
                ...relationConfig,
                limit: limit === "no_limit" ? "one_page" : "no_limit",
              },
            });
          }}
        >
          <Hash />
          <span>Limit</span>
          <span className="ml-auto text-content-secondary">
            {limit === "one_page" ? "1 page" : "No limit"}
          </span>
        </DropDrawerItem>
        <DropDrawerItem
          aria-pressed={twoWayRelation}
          onSelect={(event) => {
            event.preventDefault();
            const nextTwoWayRelation = !twoWayRelation;
            setOptimisticTwoWayRelation(nextTwoWayRelation);
            relationCommands.setTwoWay(
              {
                nextTwoWayRelation,
                propertyConfig: config,
                relatedDatabasePayload: relatedDatabaseSchema,
                relationConfig,
                relatedPropertyName,
              },
              onUpdateConfig,
            );

            if (nextTwoWayRelation && needsRepair) {
              setRepairDialogOpen(true);
            }
          }}
        >
          <ArrowUpRight />
          <span>Two-way relation</span>
          <Switch
            checked={twoWayRelation}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        {twoWayRelation && relationCreated && needsRepair ? (
          <div className="px-2 py-1.5">
            <Button
              className="w-full"
              onClick={() => setRepairDialogOpen(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Repair relations
            </Button>
          </div>
        ) : null}
        {twoWayRelation && !relationCreated ? (
          <div className="px-2 py-1.5">
            <Input
              aria-label="Related property name"
              onChange={(event) => setRelatedPropertyName(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Related property name"
              value={relatedPropertyName}
            />
          </div>
        ) : null}
        {!relationCreated ? (
          <div className="px-2 py-1.5">
            <Button
              className="w-full"
              disabled={
                addProperty.isPending ||
                (twoWayRelation && (!relatedPropertyName.trim() || !sourcePropertyId))
              }
              onClick={saveRelation}
              size="sm"
              type="button"
            >
              <Plus />
              <span>{addProperty.isPending ? "Adding..." : "Add relation"}</span>
            </Button>
          </div>
        ) : null}
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <CircleHelp />
          <span>Learn about relations</span>
        </DropDrawerItem>
        <AlertDialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Repair relation links?</AlertDialogTitle>
              <AlertDialogDescription>
                {repairDataLoading
                  ? "Loading complete relation data before repair…"
                  : "Choose which database should be treated as the source of truth."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <RadioGroup
              className="grid gap-2"
              onValueChange={(value) =>
                setRepairPrimarySource(value === "related" ? "related" : "source")
              }
              value={repairPrimarySource}
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-action-neutral-hover has-[[data-state=checked]]:border-action-selected-border has-[[data-state=checked]]:bg-action-neutral-hover">
                <RadioGroupItem className="mt-0.5" value="source" />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">Use this database as primary</span>
                  <span className="text-xs text-content-secondary">
                    Mirror {sourceDatabaseName || "this database"} links into{" "}
                    {selectedDatabase.label}.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-action-neutral-hover has-[[data-state=checked]]:border-action-selected-border has-[[data-state=checked]]:bg-action-neutral-hover">
                <RadioGroupItem className="mt-0.5" value="related" />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">Use related database as primary</span>
                  <span className="text-xs text-content-secondary">
                    Mirror {selectedDatabase.label} links into{" "}
                    {sourceDatabaseName || "this database"}.
                  </span>
                </span>
              </label>
            </RadioGroup>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={repairDataLoading} onClick={repairRelations}>
                {repairDataLoading ? "Loading…" : "Repair"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isLoading) {
    return (
      <PageDatabasePicker
        ariaLabel="Search relation databases"
        emptyMessage="No databases available."
        isLoading
        loadingMessage="Loading databases..."
        onSelect={() => undefined}
        options={[]}
        placeholder="Search databases..."
      />
    );
  }

  return (
    <PageDatabasePicker
      className="h-[min(32rem,calc(100dvh-5rem))]"
      emptyMessage="No databases available."
      ariaLabel="Search relation databases"
      heading="Databases"
      loadingMessage="Loading databases..."
      onSelect={(option) => setSelectedDatabaseId(option.value)}
      options={databaseOptions}
      placeholder="Search databases..."
    />
  );
}

export { getRelationConfig } from "@zilobase/features/databases";
