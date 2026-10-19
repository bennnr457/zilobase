import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import electronExecutable from "electron";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const launchServices =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

export async function prepareDevelopmentLaunch({
  platform = process.platform,
  executablePath = electronExecutable,
  appRoot = desktopRoot,
  environment = process.env,
  outputRoot = path.resolve(appRoot, "../../.dev/electron"),
  runCommand = run,
} = {}) {
  if (platform !== "darwin") return { executablePath, args: [appRoot] };

  // LaunchServices cannot retain `electron /path/to/app` arguments on macOS.
  // Give development its own bundle with a default entrypoint instead of
  // registering the shared Electron.app from node_modules.
  const sourceBundle = path.resolve(executablePath, "../../..");
  const bundle = path.join(outputRoot, "Zilobase Development.app");
  const marker = path.join(outputRoot, "electron-source.json");
  const sourcePlist = path.join(sourceBundle, "Contents/Info.plist");
  const sourceIdentity = JSON.stringify([1, executablePath, await readFile(sourcePlist, "utf8")]);
  const previousIdentity = await readFile(marker, "utf8").catch(() => null);
  const bundleExists = await access(path.join(bundle, "Contents/MacOS/Electron")).then(
    () => true,
    () => false,
  );
  if (previousIdentity !== sourceIdentity || !bundleExists) {
    await rm(bundle, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await cp(sourceBundle, bundle, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
  }

  const { stdout } = await runCommand("/usr/bin/plutil", [
    "-convert",
    "json",
    "-o",
    "-",
    sourcePlist,
  ]);
  const info = JSON.parse(stdout);
  const checkoutId = createHash("sha256").update(appRoot).digest("hex").slice(0, 12);
  info.CFBundleIdentifier = `com.zilobase.development.${checkoutId}`;
  info.CFBundleDisplayName = info.CFBundleName = "Zilobase Development";
  info.CFBundleURLTypes = [
    { CFBundleURLName: info.CFBundleIdentifier, CFBundleURLSchemes: ["zilobase"] },
  ];
  const plist = path.join(bundle, "Contents/Info.plist");
  await writeFile(plist, JSON.stringify(info));
  await runCommand("/usr/bin/plutil", ["-convert", "xml1", plist]);

  const resources = path.join(bundle, "Contents/Resources/app");
  await mkdir(resources, { recursive: true });
  const appPackage = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
  await writeFile(
    path.join(resources, "package.json"),
    JSON.stringify({ name: appPackage.name, version: appPackage.version, main: "main.mjs" }),
  );
  // Persist only local development configuration, so a cold URL launch has
  // the same renderer and servers even without the terminal's environment.
  const configuration = Object.fromEntries(
    ["VITE_API_URL", "ZILOBASE_DESKTOP_DEV_ORIGIN", "ZILOBASE_DESKTOP_DEV_SERVERS"]
      .filter((key) => typeof environment[key] === "string")
      .map((key) => [key, environment[key]]),
  );
  await writeFile(
    path.join(resources, "main.mjs"),
    `import { app } from "electron";
Object.assign(process.env, ${JSON.stringify(configuration)});
app.setAppPath(${JSON.stringify(appRoot)});
await import(${JSON.stringify(pathToFileURL(path.join(appRoot, appPackage.main)).href)});
`,
  );
  // Keep the executable named Electron: app.isPackaged remains false, retaining
  // development profiles, sidecar paths and disabled production updates.
  await runCommand("/usr/bin/codesign", ["--force", "--sign", "-", bundle]);
  await writeFile(marker, sourceIdentity);
  return { executablePath: path.join(bundle, "Contents/MacOS/Electron"), args: [], bundle };
}

async function main() {
  const launch = await prepareDevelopmentLaunch();
  if (launch.bundle) await run(launchServices, ["-f", launch.bundle]);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(launch.executablePath, [...launch.args, ...process.argv.slice(2)], {
    cwd: desktopRoot,
    env: environment,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
