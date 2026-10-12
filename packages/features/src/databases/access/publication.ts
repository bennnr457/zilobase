import type { ApiFetcher } from "../../shared/api-fetcher";
import { ApiError } from "../../shared/api-error";
export async function isDatabasePublished(apiFetch: ApiFetcher, databaseId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(`/databases/${databaseId}/published`, {
      auth: false,
      method: "GET",
    });

    return result.published;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}
