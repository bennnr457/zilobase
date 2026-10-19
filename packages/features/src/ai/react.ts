import { useCallback } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { prepareChatContext } from "./operations";

export function usePrepareChatContext() {
  const context = useZilobaseFeatures();
  return useCallback(
    (input: Parameters<typeof prepareChatContext>[1]) => prepareChatContext(context, input),
    [context],
  );
}
