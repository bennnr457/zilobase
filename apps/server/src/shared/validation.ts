import { Effect, Schema, type SchemaAST } from "effect";

export type JsonSchema<S extends Schema.Top> = S & {
  readonly DecodingServices: never;
};

export function decodeUnknown<S extends Schema.Top>(
  schema: JsonSchema<S>,
  input: unknown,
  options?: SchemaAST.ParseOptions,
) {
  return Schema.decodeUnknownEffect(schema)(input, options);
}

export function parseUnknown<S extends Schema.Top>(
  schema: JsonSchema<S>,
  input: unknown,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.runPromise(
    decodeUnknown(schema, input, options).pipe(
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

/** Preserve deferred JSON decoding so authorization still precedes body validation. */
export async function parseOperationBody<S extends Schema.Top>(
  schema: JsonSchema<S>,
  read: () => Promise<unknown>,
  options?: SchemaAST.ParseOptions,
) {
  const body = await read().catch(() => null);
  return parseUnknown(schema, body, options);
}
