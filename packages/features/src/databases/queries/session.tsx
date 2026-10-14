import { createContext, useContext } from "react";
export const DatabaseSessionContext = createContext<string | null>(null);
export function useDatabaseSessionId(): string {
  return useContext(DatabaseSessionContext) ?? "public";
}
