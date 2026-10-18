import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const ref = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(ref ?? "")) throw new Error("Pass the merged core commit SHA");
const gh = (path) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const comparison = gh(`repos/zilobase/zilobase/compare/${ref}...main`);
if (!["ahead", "identical"].includes(comparison.status))
  throw new Error("Core ref must be merged into main before pinning");
const manifest = gh(`repos/zilobase/zilobase/contents/package.json?ref=${ref}`);
const pkg = JSON.parse(Buffer.from(manifest.content, "base64").toString("utf8"));
if (!pkg.scripts?.["test:automations:worker"])
  throw new Error("Core ref does not contain the Worker acceptance gate");
const target = new URL(
  "../../../zilobase-cloudflare-adapter/.github/workflows/cloud.yml",
  import.meta.url,
);
const source = await readFile(target, "utf8");
const pattern = /(repository: zilobase\/zilobase\s+path: zilobase\s+ref: )[a-f0-9]{40}/;
if (!pattern.test(source)) throw new Error("Cannot identify the pinned core checkout");
const output = source.replace(pattern, `$1${ref}`);
if (process.argv.includes("--apply")) {
  await writeFile(target, output);
  console.info(`Pinned Cloudflare core checkout to ${ref}`);
} else console.info(`Dry run: pin Cloudflare core checkout to ${ref}; pass --apply to write it.`);
