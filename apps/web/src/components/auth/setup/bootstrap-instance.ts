import { bootstrapInstance as bootstrap } from "@zilobase/features/instance";
import { apiFetch, authFetch } from "@/platform/network/api";

export function bootstrapInstance(form: FormData, onBootstrapped: () => void) {
  return bootstrap(
    apiFetch,
    { signInWithPassword: (input) => authFetch("/sign-in/email", input) },
    {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? ""),
      workspaceName: String(form.get("workspaceName") ?? ""),
      bootstrapToken: String(form.get("bootstrapToken") ?? ""),
    },
    onBootstrapped,
  );
}
