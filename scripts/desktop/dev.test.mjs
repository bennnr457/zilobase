import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { desktopDevelopmentPlan } from "./dev.mjs";
import { prepareDevelopmentLaunch } from "../../apps/desktop/electron/launch-dev.mjs";

test("desktop development keeps Cloudflare as Cloud and lists the other local servers", () => {
  const plan = desktopDevelopmentPlan({
    communityApi: "http://localhost:3000",
    providers: [
      {
        id: "cloudflare",
        runtimes: [
          {
            id: "cloudflare",
            name: "Cloudflare",
            api: "http://localhost:3010",
            app: "http://localhost:1422",
          },
        ],
      },
      {
        id: "licensed",
        runtimes: [{ name: "Licensed server", api: "http://localhost:3020/" }],
      },
      {
        id: "docs",
        runtimes: [{ name: "Docs", api: "https://docs.example.com" }],
      },
    ],
  });

  assert.equal(plan.cloudApiOrigin, "http://localhost:3010");
  assert.equal(plan.cloudWebOrigin, "http://localhost:1422");
  assert.deepEqual(plan.customServers, [
    { label: "Self-hosted Community", url: "http://localhost:3000" },
    { label: "Licensed server", url: "http://localhost:3020" },
  ]);
});

test("Windows and Linux development launches include the app path", async () => {
  for (const platform of ["win32", "linux"]) {
    assert.deepEqual(
      await prepareDevelopmentLaunch({
        platform,
        executablePath: "/electron",
        appRoot: "/checkout/apps/desktop",
      }),
      { executablePath: "/electron", args: ["/checkout/apps/desktop"] },
    );
  }
});

test("macOS URL launches have a default entrypoint and retain only development settings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zilobase-desktop-dev-"));
  try {
    const source = path.join(root, "Electron.app");
    const appRoot = path.join(root, "checkout with spaces/apps/desktop");
    const outputRoot = path.join(root, "output");
    await mkdir(path.join(source, "Contents/MacOS"), { recursive: true });
    const sourceInfo = JSON.stringify({
      CFBundleExecutable: "Electron",
      CFBundleIdentifier: "com.github.Electron",
    });
    await writeFile(path.join(source, "Contents/Info.plist"), sourceInfo);
    await writeFile(path.join(source, "Contents/MacOS/Electron"), "fixture");
    if (process.platform !== "win32") {
      await symlink("MacOS", path.join(source, "Contents/RelativeLink"));
    }
    await mkdir(appRoot, { recursive: true });
    await writeFile(
      path.join(appRoot, "package.json"),
      JSON.stringify({
        name: "@zilobase/desktop",
        version: "0.0.55",
        main: "electron/main/index.mjs",
      }),
    );
    const commands = [];
    const options = {
      platform: "darwin",
      executablePath: path.join(source, "Contents/MacOS/Electron"),
      appRoot,
      outputRoot,
      environment: {
        VITE_API_URL: "http://localhost:3010",
        ZILOBASE_DESKTOP_DEV_ORIGIN: "http://localhost:1422",
        ZILOBASE_DESKTOP_DEV_SERVERS: "[]",
        PRIVATE_TOKEN: "must-not-persist",
      },
      runCommand: async (command, args) => {
        commands.push([command, args]);
        return { stdout: sourceInfo };
      },
    };
    const launch = await prepareDevelopmentLaunch(options);
    assert.deepEqual(launch.args, []);
    assert.equal(path.basename(launch.executablePath), "Electron");
    if (process.platform !== "win32") {
      assert.equal(await readlink(path.join(launch.bundle, "Contents/RelativeLink")), "MacOS");
    }
    const info = JSON.parse(
      await readFile(path.join(launch.bundle, "Contents/Info.plist"), "utf8"),
    );
    assert.match(info.CFBundleIdentifier, /^com\.zilobase\.development\./);
    assert.deepEqual(info.CFBundleURLTypes[0].CFBundleURLSchemes, ["zilobase"]);
    const resources = path.join(launch.bundle, "Contents/Resources/app");
    assert.equal(
      JSON.parse(await readFile(path.join(resources, "package.json"), "utf8")).main,
      "main.mjs",
    );
    const bootstrap = await readFile(path.join(resources, "main.mjs"), "utf8");
    assert.ok(bootstrap.includes(JSON.stringify(appRoot)));
    assert.match(bootstrap, /await import\("file:.*checkout%20with%20spaces/);
    assert.match(bootstrap, /http:\/\/localhost:1422/);
    assert.doesNotMatch(bootstrap, /PRIVATE_TOKEN|must-not-persist/);
    assert.equal(await readFile(path.join(source, "Contents/Info.plist"), "utf8"), sourceInfo);
    assert.ok(commands.some(([command]) => command === "/usr/bin/codesign"));

    await prepareDevelopmentLaunch({
      ...options,
      environment: { VITE_API_URL: "http://localhost:3020" },
    });
    const refreshed = await readFile(path.join(resources, "main.mjs"), "utf8");
    assert.match(refreshed, /http:\/\/localhost:3020/);
    assert.doesNotMatch(refreshed, /http:\/\/localhost:3010|http:\/\/localhost:1422/);

    await rm(launch.bundle, { recursive: true });
    assert.equal((await prepareDevelopmentLaunch(options)).executablePath, launch.executablePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
