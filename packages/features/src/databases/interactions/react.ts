import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { recordPublicationInterests } from "../cache-references";
import { sharedClient } from "../../data/client";
import { useSharedDataInterests } from "../../data/react";
import { useZilobaseFeatures } from "../../shared/context";
import { changeDatabaseRow } from "../commands";
import type { DatabaseBootstrapResponse, DatabaseRecordEntity } from "../core/entities";
import type { DatabaseCommandTarget } from "../mutations/pending";
import { useDatabaseSessionId } from "../queries/session";
import { projectDatabaseMetadata } from "./metadata";
import { projectRecordInteractions } from "./model";
import { type ChangeDatabaseRowInput } from "./record-change";
import { databaseController } from "./store";
export { submitRecordChange, type ChangeDatabaseRowInput } from "./record-change";

export function useDatabaseEntityCommandState(target: DatabaseCommandTarget) {
  const state = useDatabaseController().commandState;
  const key = JSON.stringify(target);
  const subscribe = useCallback(
    (notify: () => void) => state.subscribeTo(target, notify),
    [state, key],
  );
  return useSyncExternalStore(
    subscribe,
    () => state.get(target),
    () => state.get(target),
  );
}

export function useDatabaseController() {
  const { apiFetch, queryClient, lifecycle } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return databaseController(queryClient, sessionId, apiFetch, lifecycle);
}

/** Stable sparse selections prevent unrelated commands from rebuilding a view. */
export function useDatabaseIntentions(
  scope: { hostId?: string; sourceId?: string; metadataOnly?: boolean } = {},
) {
  const store = useDatabaseController();
  const selection = useMemo(() => {
    let previous: readonly import("./model").DatabaseIntention[] = [];
    const read = () => {
      const next = store
        .getSnapshot()
        .filter(
          (item) =>
            (!scope.hostId ||
              item.hostId === scope.hostId ||
              item.creation?.database.id === scope.hostId ||
              item.metadataEffects?.some((effect) => effect.hostId === scope.hostId)) &&
            (!scope.sourceId ||
              item.effects.some((effect) => effect.dataSourceId === scope.sourceId) ||
              item.metadataEffects?.some((effect) => effect.dataSourceId === scope.sourceId)) &&
            (!scope.metadataOnly || item.creation || item.metadataEffects?.length),
        );
      if (next.length !== previous.length || next.some((item, index) => item !== previous[index]))
        previous = next;
      return previous;
    };
    const subscribe = (notify: () => void) =>
      store.subscribe(() => {
        const before = previous;
        if (read() !== before) notify();
      });
    return { read, subscribe };
  }, [store, scope.hostId, scope.sourceId, scope.metadataOnly]);
  return useSyncExternalStore(selection.subscribe, selection.read, selection.read);
}

export function useDatabaseCreationFailed(databaseId: string | null) {
  const controller = useDatabaseController();
  return useSyncExternalStore(
    controller.subscribe,
    () => Boolean(databaseId && controller.creationFailed(databaseId)),
    () => false,
  );
}

export function useProjectedDatabaseBootstrap(
  snapshot: DatabaseBootstrapResponse | undefined,
  hostId?: string,
) {
  const intentions = useDatabaseIntentions({ hostId, metadataOnly: true });
  const base =
    snapshot ?? intentions.find((item) => item.creation?.database.id === hostId)?.creation;
  return useMemo(
    () =>
      base
        ? projectDatabaseMetadata(
            base,
            intentions.map((item) => ({
              ...item,
              metadataEffects: item.metadataEffects?.filter((effect) => effect.insert),
            })),
          )
        : undefined,
    [base, intentions],
  );
}

export function useProjectedDatabaseRecords(input: {
  databaseId?: string | null;
  dataSourceId: string | null;
  sourceVersion: number | null;
  records: DatabaseRecordEntity[];
}) {
  const store = useDatabaseController();
  const sessionId = useDatabaseSessionId();
  const { queryClient } = useZilobaseFeatures();
  const owner = input.databaseId
    ? sharedClient(queryClient).database(input.databaseId, sessionId)
    : undefined;
  const interactions = useDatabaseIntentions({ sourceId: input.dataSourceId ?? undefined });
  const interests = useMemo(
    () =>
      recordPublicationInterests(
        queryClient,
        owner?.session.id,
        input.records.map(({ id }) => id),
      ),
    [queryClient, owner, input.records],
  );
  const revision = useSharedDataInterests(queryClient, interests);

  const key = useRef({});
  useEffect(() => {
    if (input.dataSourceId)
      store.observe(key.current, {
        dataSourceId: input.dataSourceId,
        sourceVersion: input.sourceVersion,
      });
  }, [store, input.dataSourceId, input.sourceVersion]);
  useEffect(() => {
    const token = key.current;
    return () => store.unobserve(token);
  }, [store]);
  return useMemo(
    () =>
      input.dataSourceId
        ? projectRecordInteractions(input.records, interactions, {
            dataSourceId: input.dataSourceId,
            sourceVersion: input.sourceVersion,
            resolveRecord: (id) => owner?.databases.resolveRecord(id),
          })
        : input.records,
    [
      input.records,
      input.dataSourceId,
      input.sourceVersion,
      interactions,
      queryClient,
      revision,
      owner,
    ],
  );
}

export function useChangeDatabaseRow(target: DatabaseCommandTarget = {}) {
  const context = useZilobaseFeatures();
  const state = useDatabaseEntityCommandState(target);
  const intentions = useDatabaseIntentions({
    hostId: target.hostDatabaseId,
    sourceId: target.dataSourceId,
  });
  const mutateAsync = (input: ChangeDatabaseRowInput) => {
    try {
      return changeDatabaseRow(context, input);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return {
    isPending: state.isPending || intentions.length > 0,
    mutateAsync,
    mutate(
      input: ChangeDatabaseRowInput,
      callbacks?: {
        onError?: (error: Error) => void;
        onSuccess?: (record: DatabaseRecordEntity) => void;
      },
    ) {
      void mutateAsync(input).then(callbacks?.onSuccess, (error) =>
        callbacks?.onError?.(error instanceof Error ? error : new Error(String(error))),
      );
    },
  };
}

export function useDatabaseInteractionRecovery(hostId?: string) {
  const store = useDatabaseController();
  const interactions = useDatabaseIntentions({ hostId });
  return {
    synchronizationError: useSyncExternalStore(
      store.subscribe,
      () => store.getSynchronizationError(hostId),
      () => store.getSynchronizationError(hostId),
    ),
    retry: () => store.retryUnconfirmed(),
    hasUnconfirmed: interactions.some(({ status }) => status === "unconfirmed"),
  };
}
