import type { ApiFetcher } from "../shared/api-fetcher";
import type { ZilobaseAuthClient } from "../shared/auth-client";
import type { BootstrapInstanceInput } from "./contracts";
export async function bootstrapInstance(
  apiFetch: ApiFetcher,
  auth: Pick<ZilobaseAuthClient, "signInWithPassword">,
  input: BootstrapInstanceInput,
  onBootstrapped: () => void,
) {
  const email = input.email.trim().toLowerCase();
  await apiFetch("/api/instance/bootstrap", {
    auth: false,
    body: JSON.stringify({
      email,
      name: input.name.trim(),
      password: input.password,
      workspaceName: input.workspaceName.trim(),
    }),
    headers: { "x-zilobase-bootstrap-token": input.bootstrapToken.trim() },
    method: "POST",
  });
  onBootstrapped();
  await auth.signInWithPassword({ email, password: input.password });
}
