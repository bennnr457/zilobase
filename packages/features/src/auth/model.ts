export function getAuthReturnPath(
  fallback: string,
  search: string,
  currentOrigin: string,
  allowedOrigins: ReadonlySet<string>,
) {
  const returnTo = new URLSearchParams(search).get("returnTo");
  if (!returnTo) return fallback;

  const isRelative = returnTo.startsWith("/") && !returnTo.startsWith("//");

  let url: URL;
  try {
    url = new URL(returnTo, currentOrigin);
  } catch {
    return fallback;
  }

  if (url.pathname === "/desktop-auth") return fallback;

  if (isRelative && url.origin === currentOrigin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  if (
    url.pathname === "/desktop/authorize" &&
    !url.username &&
    !url.password &&
    !url.hash &&
    allowedOrigins.has(url.origin)
  ) {
    return url.toString();
  }

  return fallback;
}

export function getInvitationAuthSearch(
  search: string,
  origin: string,
  allowedOrigins: ReadonlySet<string>,
) {
  const parameters = new URLSearchParams(search);
  const directInvitation = readSingleNonEmpty(parameters, "invitation");
  const safeReturnTo = getAuthReturnPath("/recents", search, origin, allowedOrigins);

  if (directInvitation) {
    const requestedReturnTo = readInvitationReturnTo(safeReturnTo, directInvitation, origin);
    const returnTo =
      requestedReturnTo ?? `/accept-invitation?id=${encodeURIComponent(directInvitation)}`;
    return {
      invitation: directInvitation,
      returnTo,
    };
  }

  try {
    const url = new URL(safeReturnTo, origin);
    const invitation = readSingleNonEmpty(url.searchParams, "id");

    if (url.origin === origin && isInvitationAcceptancePath(url.pathname) && invitation) {
      return { invitation, returnTo: `${url.pathname}${url.search}` };
    }
  } catch {
    // Fall through to a normal signup link.
  }

  return {};
}

function readInvitationReturnTo(returnTo: string, invitationId: string, origin: string) {
  try {
    const url = new URL(returnTo, origin);
    return url.origin === origin &&
      isInvitationAcceptancePath(url.pathname) &&
      readSingleNonEmpty(url.searchParams, "id") === invitationId
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

function isInvitationAcceptancePath(pathname: string) {
  return pathname === "/accept-invitation" || pathname === "/accept-page-invitation";
}

function readSingleNonEmpty(parameters: URLSearchParams, key: string) {
  const values = parameters.getAll(key);
  const value = values[0]?.trim();
  return values.length === 1 && value ? value : null;
}

const bootstrapRequiredMessage = "this zilobase instance must be bootstrapped before registration.";

export function isBootstrapRequiredAuthError(error: unknown) {
  if (typeof error !== "string") return false;

  const normalized = error.trim().replaceAll("_", " ").toLowerCase();
  return normalized === "bootstrap required" || normalized === bootstrapRequiredMessage;
}

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
