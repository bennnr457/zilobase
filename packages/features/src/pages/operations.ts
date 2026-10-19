import { sharedClient } from "../data/client";
import { publishDatabaseEvent } from "../databases/cache-publication";
import type { DatabaseMutationEventV2 } from "../databases/core/entities";
import { setPageDetailCache } from "../shared/item-action-cache";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { readCachedPage, resolvePageDetailReference } from "./cache";
import { createPage } from "./content-operations";
import type { Page } from "./contracts";
import { buildPageDuplicateInput, hasPageBodyContent } from "./models";
import type { PagePropertiesReference } from "./property-cache";
import { resolvePageProperties } from "./property-cache";
import {
  pagePropertiesQueryKey,
  pagePropertiesQueryOptions,
  pageQueryKey,
  pageQueryOptions,
} from "./queries";

export async function getPage(context: ClientOperationContext, input: { pageId: string }) {
  const scope = captureClientOperation(context);
  const reference = await context.queryClient.fetchQuery(
    pageQueryOptions(scope.context.apiFetch, input.pageId),
  );
  scope.assertCurrent();
  return resolvePageDetailReference(context.queryClient, reference);
}

export async function getPageContent(context: ClientOperationContext, input: { pageId: string }) {
  const detail = await getPage(context, input);
  return detail ? { content: detail.page.content, updatedAt: detail.page.updatedAt } : null;
}

/** Preserve existing duplication: create one page from its current body/metadata. */
export async function duplicatePage(
  context: ClientOperationContext,
  input: { pageId: string; parentItemId?: string },
) {
  const scope = captureClientOperation(context);
  const detail = await getPage(context, input);
  scope.assertCurrent();
  if (!detail) throw new Error("Page not found");
  return createPage(context, buildPageDuplicateInput(detail.page, input.parentItemId));
}

export type ReplacePageContentInput = { pageId: string; content: unknown; baseUpdatedAt?: string };
export async function replacePageContent(
  context: ClientOperationContext,
  input: ReplacePageContentInput,
) {
  const scope = captureClientOperation(context);
  const previous = readCachedPage(context.queryClient, input.pageId);
  const result = await scope.context.apiFetch<{ page: Pick<Page, "id" | "updatedAt"> | Page }>(
    `/pages/${encodeURIComponent(input.pageId)}/content`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content: input.content,
        baseUpdatedAt: input.baseUpdatedAt ?? previous?.updatedAt,
      }),
    },
  );
  scope.assertCurrent();
  if (previous)
    setPageDetailCache(
      context.queryClient,
      {
        ...previous,
        ...result.page,
        content: input.content,
        hasContent: hasPageBodyContent(input.content),
      },
      scope.read,
    );
  else await context.queryClient.invalidateQueries({ queryKey: pageQueryKey(input.pageId) });
  return result;
}

export async function getPageProperties(
  context: ClientOperationContext,
  input: { pageId: string },
) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchQuery(
    pagePropertiesQueryOptions(scope.context.apiFetch, input.pageId),
  );
  scope.assertCurrent();
  return resolvePageProperties(context.queryClient, result);
}

export async function updatePagePropertyValue(
  context: ClientOperationContext,
  input: { pageId: string; propertyId: string; value: unknown },
) {
  const scope = captureClientOperation(context);
  const result = await scope.context.apiFetch<{ events: DatabaseMutationEventV2[] }>(
    `/pages/${encodeURIComponent(input.pageId)}/properties/${encodeURIComponent(input.propertyId)}/value`,
    { method: "PUT", body: JSON.stringify({ value: input.value }) },
  );
  scope.assertCurrent();
  const reference = context.queryClient.getQueryData<PagePropertiesReference>(
    pagePropertiesQueryKey(input.pageId),
  );
  const owner = reference ? sharedClient(context.queryClient).get(reference.cacheId) : undefined;
  if (owner)
    for (const event of result.events) publishDatabaseEvent(context.queryClient, owner, event);
  else await context.queryClient.invalidateQueries({ queryKey: ["db"] });
  scope.assertCurrent();
  await context.queryClient.invalidateQueries({ queryKey: pagePropertiesQueryKey(input.pageId) });
  return result;
}

export type GetPageInput = Parameters<typeof getPage>[1];
export type GetPageResult = Awaited<ReturnType<typeof getPage>>;
export type GetPageContentInput = Parameters<typeof getPageContent>[1];
export type GetPageContentResult = Awaited<ReturnType<typeof getPageContent>>;
export type DuplicatePageInput = Parameters<typeof duplicatePage>[1];
export type DuplicatePageResult = Awaited<ReturnType<typeof duplicatePage>>;
export type ReplacePageContentResult = Awaited<ReturnType<typeof replacePageContent>>;
export type GetPagePropertiesInput = Parameters<typeof getPageProperties>[1];
export type GetPagePropertiesResult = Awaited<ReturnType<typeof getPageProperties>>;
export type UpdatePagePropertyValueInput = Parameters<typeof updatePagePropertyValue>[1];
export type UpdatePagePropertyValueResult = Awaited<ReturnType<typeof updatePagePropertyValue>>;
