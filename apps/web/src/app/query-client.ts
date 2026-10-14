import { createZilobaseClient } from "@zilobase/features";
import { pageCacheDeploymentKey } from "@/platform/storage/page-cache-database";

export const clientDeployment = pageCacheDeploymentKey;
export const { queryClient } = createZilobaseClient({ deployment: clientDeployment });
