import { execFileSync } from "node:child_process";

const required = [
  "Core checks",
  "Runtime adapters",
  "Automation node acceptance",
  "Automation worker acceptance",
  "Background recovery",
];
const gh = (args, input) =>
  JSON.parse(
    execFileSync("gh", args, {
      encoding: "utf8",
      ...(input ? { input: JSON.stringify(input) } : {}),
    }),
  );
const repo = gh(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]);
const name = repo.nameWithOwner;
const branch = repo.defaultBranchRef.name;
const head = gh(["api", `repos/${name}/commits/${encodeURIComponent(branch)}`]).sha;
const checks = gh(["api", `repos/${name}/commits/${head}/check-runs?per_page=100`]).check_runs;
const missing = required.filter(
  (context) => !checks.some((check) => check.name === context && check.conclusion === "success"),
);
if (missing.length) {
  console.error(
    `Required checks are not yet successful on ${name}@${head}: ${missing.join(", ")}. Merge and validate the CI setup before activation.`,
  );
  process.exitCode = 1;
} else {
  const rulesets = gh(["api", `repos/${name}/rulesets`]);
  const existing = rulesets.find((rule) => rule.name === "Automation backend checks");
  const config = {
    name: "Automation backend checks",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: required.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      },
    ],
  };
  if (existing) {
    const prior = gh(["api", `repos/${name}/rulesets/${existing.id}`]);
    const oldRequired = prior.rules?.find((rule) => rule.type === "required_status_checks");
    const contexts = new Map(
      (oldRequired?.parameters?.required_status_checks ?? []).map((check) => [
        check.context,
        check,
      ]),
    );
    for (const context of required) if (!contexts.has(context)) contexts.set(context, { context });
    config.rules = [
      ...(prior.rules ?? []).filter((rule) => rule.type !== "required_status_checks"),
      {
        type: "required_status_checks",
        parameters: {
          ...oldRequired?.parameters,
          required_status_checks: [...contexts.values()],
          strict_required_status_checks_policy: true,
        },
      },
    ];
    if (prior.bypass_actors) config.bypass_actors = prior.bypass_actors;
    if (prior.conditions) config.conditions = prior.conditions;
  }
  if (process.argv.includes("--apply")) {
    gh(
      [
        "api",
        "--method",
        existing ? "PUT" : "POST",
        `repos/${name}/rulesets${existing ? `/${existing.id}` : ""}`,
        "--input",
        "-",
      ],
      config,
    );
    console.info("Automation backend checks required; other repository rules remain unchanged.");
  } else
    console.info(
      JSON.stringify({ repository: name, branch, checks: required, mode: "dry-run" }, null, 2),
    );
}
