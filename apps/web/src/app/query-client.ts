import { createZilobaseClient } from "@zilobase/features";
import { resolveApiBaseUrl } from "@/platform/network/api";

export const clientDeployment = () => resolveApiBaseUrl() || window.location.origin;
export const { queryClient } = createZilobaseClient({ deployment: clientDeployment });
