import type { OutboundFetch } from "@zilobase/runtime-ports";
import { fetchPinnedNodeWebhook } from "./pinned-webhook";

export function createNodeOutboundFetch(
  options: {
    fetchWebhook?: OutboundFetch["fetchWebhook"];
  } = {},
): OutboundFetch {
  return {
    fetchWebhook: options.fetchWebhook ?? fetchPinnedNodeWebhook,
  };
}
