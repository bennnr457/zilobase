import { Effect, Schema, type SchemaAST } from "effect";

import { readJsonBody } from "./request";

type JsonBodyRequest = {
  json(): Promise<unknown>;
};

import { decodeUnknown, type JsonSchema } from "../../shared/validation";
export { decodeUnknown, parseUnknown } from "../../shared/validation";

export function decodeJsonBody<S extends Schema.Top>(
  request: JsonBodyRequest,
  schema: JsonSchema<S>,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.promise(() => readJsonBody(request)).pipe(
    Effect.flatMap((body) => decodeUnknown(schema, body, options)),
  );
}

export function parseJsonBody<S extends Schema.Top>(
  request: JsonBodyRequest,
  schema: JsonSchema<S>,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.runPromise(
    decodeJsonBody(request, schema, options).pipe(
      Effect.match({
        onFailure: (error) => ({
          ok: false as const,
          message: error.message,
        }),
        onSuccess: (data) => ({ ok: true as const, data }),
      }),
    ),
  );
}
