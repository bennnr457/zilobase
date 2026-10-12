export function addLoopbackOriginAliases(origins: Set<string>, origin: string) {
  origins.add(origin);
  try {
    const url = new URL(origin);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return;
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      url.hostname = hostname;
      origins.add(url.origin);
    }
  } catch {
    // Ignore unparseable origins.
  }
}
