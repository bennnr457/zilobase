import { Schema, SchemaTransformation } from "effect";
export const strictJson = { onExcessProperty: "error" as const };

export const IsoDateTimeString = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
      message: "Invalid date-time format",
    }),
  ),
);

export const MemberInvitationInput = Schema.Struct({
  accessExpiresAt: Schema.optionalKey(Schema.NullOr(IsoDateTimeString)),
  email: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Invalid email" })),
  ),
  role: Schema.Literals(["admin", "member", "temporary"]),
});

export const MemberUpdateInput = Schema.Struct({
  accessExpiresAt: Schema.optionalKey(Schema.NullOr(IsoDateTimeString)),
  role: Schema.Literals(["owner", "admin", "member", "temporary"]),
});

export const trimmedLogo = Schema.String.pipe(
  Schema.decode(SchemaTransformation.trim()),
  Schema.check(
    Schema.makeFilter((value) => {
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Enter a valid logo URL.";
      }
    }),
  ),
);

export const UpdateWorkspaceInput = Schema.Struct({
  logo: Schema.optionalKey(Schema.Union([trimmedLogo, Schema.Literal(""), Schema.Null])),
  metadata: Schema.optionalKey(
    Schema.Union([
      Schema.String.pipe(
        Schema.decode(SchemaTransformation.trim()),
        Schema.check(Schema.isMaxLength(5000)),
      ),
      Schema.Literal(""),
      Schema.Null,
    ]),
  ),
  name: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(
        Schema.isMinLength(1, { message: "Workspace name is required." }),
        Schema.isMaxLength(120),
      ),
    ),
  ),
  slug: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(
        Schema.isMinLength(1, { message: "Slug is required." }),
        Schema.isMaxLength(120),
        Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
          message: "Use lowercase letters, numbers, and hyphens only.",
        }),
      ),
    ),
  ),
}).check(
  Schema.makeFilter((value) =>
    value.name !== undefined ||
    value.slug !== undefined ||
    value.logo !== undefined ||
    value.metadata !== undefined
      ? undefined
      : "Provide at least one field to update.",
  ),
);

export const DeleteWorkspaceInput = Schema.Struct({
  confirmationName: Schema.String,
});
