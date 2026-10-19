import { apiFetch } from "@/platform/network/api";
import { createZilobaseClient } from "@zilobase/features";
export {
  getUserImageUrl,
  uploadPageImage,
  uploadProfileImage,
} from "@/platform/network/image-upload";
export function createImageUploadRuntime() {
  const runtime = createZilobaseClient({ deployment: "test" });
  return { ...runtime, context: { apiFetch, queryClient: runtime.queryClient } };
}

export {
  beginDesktopServerNetworkShutdown,
  resetDesktopServerNetworkForTests,
} from "@/platform/network/desktop-network";
