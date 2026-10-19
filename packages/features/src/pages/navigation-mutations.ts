import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  convertPageToTeamspace,
  embedPageItem,
  movePageToTeamspace,
  recordItemVisit,
  removePageEmbed,
  setPageFavorite,
} from "./navigation-operations";
export function useSetPageFavorite() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof setPageFavorite>[1]) => setPageFavorite(context, input),
  });
}
export function useRecordItemVisit() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof recordItemVisit>[1]) => recordItemVisit(context, input),
  });
}
export function useMovePageToTeamspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof movePageToTeamspace>[1]) =>
      movePageToTeamspace(context, input),
  });
}
export function useConvertPageToTeamspace() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof convertPageToTeamspace>[1]) =>
      convertPageToTeamspace(context, input),
  });
}
export function useEmbedPageItem() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof embedPageItem>[1]) => embedPageItem(context, input),
  });
}
export function useRemovePageEmbed() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof removePageEmbed>[1]) => removePageEmbed(context, input),
  });
}
