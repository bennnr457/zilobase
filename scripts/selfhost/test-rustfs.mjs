#!/usr/bin/env node

// Uses disposable Compose resources only; never touches the source-dev project.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { createNodeImageStorage } from "../../packages/runtime-adapter/src/node/image-storage.ts";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "zilobase-rustfs-"));
const project = `zilobase-rustfs-test-${process.pid}-${Date.now()}`;
const envFile = path.join(temporary, "dependencies.env");
const backup = path.join(temporary, "backup");
const accessKey = "rustfs-test";
const secretKey = `-${randomBytes(32).toString("hex")}`;
const port = await freePort();
const consolePort = await freePort();
const browserPort = await freePort();
const origin = `http://127.0.0.1:${browserPort}`;
const endpoint = `http://127.0.0.1:${port}`;
const storageEnv = {
  S3_ACCESS_KEY_ID: accessKey,
  S3_SECRET_ACCESS_KEY: secretKey,
  S3_BUCKET_NAME: "zilobase-node",
  S3_ENDPOINT: endpoint,
  S3_PUBLIC_ENDPOINT: endpoint,
};
const storage = createNodeImageStorage(storageEnv);
const require = createRequire(path.join(root, "packages/runtime-adapter/package.json"));
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const client = new S3Client({
  endpoint,
  forcePathStyle: true,
  region: "auto",
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
});
let browser;
let server;
try {
  await mkdir(backup);
  await writeFile(
    envFile,
    [
      `RUSTFS_ACCESS_KEY=${accessKey}`,
      `RUSTFS_SECRET_KEY=${secretKey}`,
      `RUSTFS_API_PORT=${port}`,
      `RUSTFS_CONSOLE_PORT=${consolePort}`,
      `RUSTFS_CORS_ALLOWED_ORIGINS=${origin},zilo-desktop://app`,
      "POSTGRES_USER=unused",
      "POSTGRES_PASSWORD=unused",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.info("Starting fresh RustFS and checking repeatable private bucket initialization...");
  await compose("up", "-d", "--wait", "rustfs");
  await compose("run", "--rm", "-T", "rustfs-init");
  await compose("run", "--rm", "-T", "rustfs-init");
  assert.equal((await fetch(`${endpoint}/health/live`)).status, 200);
  assert.equal((await fetch(`${endpoint}/health/ready`)).status, 200);
  await storage.checkReady();
  await assert.rejects(
    createNodeImageStorage({
      ...storageEnv,
      S3_SECRET_ACCESS_KEY: "incorrect-secret-key",
    }).checkReady(),
  );

  console.info("Checking browser CORS, signed URLs, metadata, deletion, and private access...");
  const bytes = Buffer.from("RustFS browser upload verification");
  const objectKey = "cutover/probe.txt";
  const upload = await storage.createUploadUrl({
    byteSize: bytes.length,
    contentType: "text/plain",
    expiresInSeconds: 60,
    objectKey,
  });
  server = createServer((_request, response) =>
    response.end("<!doctype html><title>RustFS test</title>"),
  );
  await new Promise((resolve) => server.listen(browserPort, "127.0.0.1", resolve));
  const preflight = await fetch(upload.url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.ok(preflight.ok, `CORS preflight returned ${preflight.status}`);
  assert.ok(["*", origin].includes(preflight.headers.get("access-control-allow-origin")));
  const desktopPreflight = await fetch(upload.url, {
    method: "OPTIONS",
    headers: { Origin: "zilo-desktop://app", "Access-Control-Request-Method": "PUT" },
  });
  assert.equal(desktopPreflight.headers.get("access-control-allow-origin"), "zilo-desktop://app");
  const rejectedOrigin = await fetch(upload.url, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.invalid", "Access-Control-Request-Method": "PUT" },
  });
  assert.equal(rejectedOrigin.headers.get("access-control-allow-origin"), null);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(origin);
  const status = await page.evaluate(
    async ({ upload, body }) => {
      const response = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body,
      });
      return response.status;
    },
    { upload, body: bytes.toString() },
  );
  assert.ok(status >= 200 && status < 300, `Browser PUT returned ${status}`);
  const metadata = await storage.head(objectKey);
  assert.equal(metadata.byteSize, bytes.length);
  assert.equal(metadata.contentType, "text/plain");
  assert.ok(metadata.etag);
  assert.equal(await readObject(objectKey), bytes.toString());
  const readUrl = await storage.createReadUrl({
    objectKey,
    expiresInSeconds: 60,
    filename: "probe.txt",
  });
  const download = await fetch(readUrl);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /probe\.txt/);
  assert.equal(await download.text(), bytes.toString());
  assert.equal((await fetch(`${endpoint}/zilobase-node/${objectKey}`)).status, 403);
  assert.equal(await storage.head("missing"), null);
  assert.equal(await storage.get("missing"), null);
  await storage.delete(objectKey);
  assert.equal(await storage.head(objectKey), null);
  const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes });
  assert.ok(put.ok);

  const expired = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: "zilobase-node", Key: "expired" }),
    {
      expiresIn: 1,
      signingDate: new Date(Date.now() - 60_000),
    },
  );
  assert.ok([400, 403].includes((await fetch(expired, { method: "PUT", body: "expired" })).status));
  console.info("Checking outage handling and restart persistence...");
  await compose("stop", "rustfs");
  await assert.rejects(storage.checkReady());
  await compose("up", "-d", "--wait", "rustfs");
  assert.equal(await readObject(objectKey), bytes.toString());

  console.info("Backing up and restoring objects into a fresh RustFS volume...");
  await mirror("backup");
  await compose("down", "--volumes");
  await compose("up", "-d", "--wait", "rustfs");
  await compose("run", "--rm", "-T", "rustfs-init");
  assert.equal(await storage.head(objectKey), null);
  await mirror("restore");
  assert.equal(await readObject(objectKey), bytes.toString());
  assert.equal((await storage.head(objectKey)).contentType, metadata.contentType);
  assert.equal((await storage.head(objectKey)).byteSize, metadata.byteSize);
  console.info("RustFS storage verification passed.");
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  client.destroy();
  try {
    await compose("down", "--volumes", "--remove-orphans");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function readObject(key) {
  const object = await storage.get(key);
  assert.ok(object);
  return new Response(object.body).text();
}

async function compose(...args) {
  try {
    return await run(
      "docker",
      [
        "compose",
        "--project-name",
        project,
        "--env-file",
        envFile,
        "-f",
        "scripts/dev/dependencies.compose.yml",
        ...args,
      ],
      { cwd: root, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`RustFS Compose ${args[0]} failed: ${error.stderr ?? error.message}`);
  }
}

async function mirror(direction) {
  const script =
    'rc alias set -- local http://rustfs:9000 "$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" >/dev/null && ' +
    (direction === "backup"
      ? "rc mirror --overwrite local/zilobase-node /backup"
      : "rc mirror --overwrite /backup local/zilobase-node");
  await run("docker", [
    "run",
    "--rm",
    "--user",
    "0:0",
    "--network",
    `${project}_default`,
    "--env-file",
    envFile,
    "--volume",
    `${backup}:/backup${direction === "restore" ? ":ro" : ""}`,
    "--entrypoint",
    "/bin/sh",
    "rustfs/rc:v0.1.36",
    "-c",
    script,
  ]);
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
