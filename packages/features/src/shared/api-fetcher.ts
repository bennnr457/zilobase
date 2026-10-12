export type ApiFetcher = <T>(path: string, init?: RequestInit & { auth?: boolean }) => Promise<T>;
