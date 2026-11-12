import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import { renderArtifacts } from "../build.mjs";
import { SCENARIOS } from "../test/harness/scenarios.js";

const thisFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(thisFile), "..");
const DEFAULT_CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const scenarios = [];
  let list = false;
  let outDir = resolve(rootDir, ".tmp/harness/out");
  let theme = null;
  let allThemes = false;
  let settings = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--all-themes") {
      allThemes = true;
    } else if (arg === "--out") {
      const next = argv[++i];
      if (!next) throw new Error("--out requires a directory path");
      outDir = resolve(process.cwd(), next);
    } else if (arg.startsWith("--out=")) {
      outDir = resolve(process.cwd(), arg.slice("--out=".length));
    } else if (arg === "--theme") {
      const next = argv[++i];
      if (!next) throw new Error("--theme requires a value");
      theme = next;
    } else if (arg.startsWith("--theme=")) {
      theme = arg.slice("--theme=".length);
    } else if (arg === "--settings") {
      const next = argv[++i];
      if (!next) throw new Error("--settings requires a JSON string");
      settings = next;
    } else if (arg.startsWith("--settings=")) {
      settings = arg.slice("--settings=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      scenarios.push(arg);
    }
  }

  if (theme != null && theme !== "light" && theme !== "dark") {
    throw new Error(`Unknown theme: ${theme} (expected "light" or "dark")`);
  }

  return { scenarios, list, outDir, theme, allThemes, settings };
}

async function fileExists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const fromEnv = process.env.CHROME_BIN?.trim();
  if (fromEnv && await fileExists(fromEnv)) return fromEnv;
  if (!fromEnv && await fileExists(DEFAULT_CHROME_MAC)) return DEFAULT_CHROME_MAC;
  return null;
}

async function buildHarness() {
  const harnessDir = resolve(rootDir, ".tmp/harness");
  await mkdir(harnessDir, { recursive: true });
  await esbuild({
    absWorkingDir: rootDir,
    entryPoints: ["test/harness/entry.js"],
    outfile: resolve(harnessDir, "harness.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    charset: "utf8",
    legalComments: "none",
    logLevel: "silent",
  });
  const { css } = await renderArtifacts(rootDir);
  await Promise.all([
    writeFile(resolve(harnessDir, "harness.css"), css, "utf8"),
    copyFile(resolve(rootDir, "test/harness/index.html"), resolve(harnessDir, "index.html")),
  ]);
  return harnessDir;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseHarnessResult(domHtml) {
  const match = /<pre\b[^>]*\bid=["']harness-result["'][^>]*>([\s\S]*?)<\/pre>/i.exec(domHtml);
  if (!match) return null;
  const raw = decodeHtmlEntities(match[1]).trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function extractStderrConsoleLines(stderr) {
  if (!stderr) return [];
  return stderr
    .split(/\r?\n/)
    .filter((line) => /CONSOLE\(\d+\)/.test(line));
}

async function runChrome(chromeBin, extraArgs) {
  const profileDir = await mkdtemp(join(tmpdir(), "compass-smoke-"));
  const baseArgs = [
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-prefers-reduced-motion",
    "--window-size=1440,900",
    "--virtual-time-budget=8000",
    ...extraArgs,
  ];

  try {
    return await new Promise((resolveRun) => {
      let timedOut = false;
      const stdoutChunks = [];
      const stderrChunks = [];
      const child = spawn(chromeBin, baseArgs, { stdio: ["ignore", "pipe", "pipe"] });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, CHROME_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

      child.on("error", (error) => {
        clearTimeout(timer);
        resolveRun({
          code: 1,
          timedOut,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\n${error.message}`.trim(),
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolveRun({
          code: code ?? 1,
          timedOut,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
    });
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function runScenario({ chromeBin, indexHtmlPath, outDir, name, theme, settings }) {
  const effectiveTheme = theme === "dark" ? "dark" : "light";
  const suffix = effectiveTheme === "dark" ? ".dark" : "";

  const url = pathToFileURL(indexHtmlPath);
  url.searchParams.set("scenario", name);
  if (effectiveTheme === "dark") url.searchParams.set("theme", "dark");
  if (settings) url.searchParams.set("settings", settings);
  const pageUrl = url.href;

  const screenshotPath = resolve(outDir, `${name}${suffix}.png`);
  const jsonPath = resolve(outDir, `${name}${suffix}.json`);
  await rm(screenshotPath, { force: true });

  const domRun = await runChrome(chromeBin, ["--dump-dom", pageUrl]);
  let result = null;

  if (domRun.timedOut) {
    result = {
      scenario: name,
      theme: effectiveTheme,
      ok: false,
      assertions: [],
      errors: [`Chrome --dump-dom timed out after ${CHROME_TIMEOUT_MS / 1000}s`],
      consoleErrors: extractStderrConsoleLines(domRun.stderr),
      done: false,
    };
  } else {
    try {
      result = parseHarnessResult(domRun.stdout);
    } catch (error) {
      result = {
        scenario: name,
        theme: effectiveTheme,
        ok: false,
        assertions: [],
        errors: [`Invalid JSON in #harness-result: ${error.message}`],
        consoleErrors: extractStderrConsoleLines(domRun.stderr),
        done: false,
      };
    }
    if (!result || result.done !== true) {
      const detail = domRun.code !== 0
        ? `Chrome --dump-dom exited with code ${domRun.code}`
        : "Scenario produced no completed result in #harness-result";
      result = {
        scenario: name,
        theme: effectiveTheme,
        ok: false,
        assertions: result?.assertions ?? [],
        errors: [...(result?.errors ?? []), detail],
        consoleErrors: result?.consoleErrors?.length
          ? result.consoleErrors
          : extractStderrConsoleLines(domRun.stderr),
        done: false,
      };
    } else {
      result.theme = effectiveTheme;
      if (!Array.isArray(result.consoleErrors)) result.consoleErrors = [];
    }
  }

  const shotRun = await runChrome(chromeBin, [`--screenshot=${screenshotPath}`, pageUrl]);
  if (shotRun.timedOut) {
    result.ok = false;
    result.errors.push(`Chrome --screenshot timed out after ${CHROME_TIMEOUT_MS / 1000}s`);
  } else if (shotRun.code !== 0) {
    result.ok = false;
    result.errors.push(`Chrome --screenshot exited with code ${shotRun.code}`);
  } else {
    try {
      const info = await stat(screenshotPath);
      if (info.size === 0) {
        result.ok = false;
        result.errors.push("Screenshot file is empty");
      }
    } catch {
      result.ok = false;
      result.errors.push("Screenshot file was not written");
    }
  }

  if (result.errors.length > 0 || result.consoleErrors.length > 0 || result.assertions.some((item) => !item.ok)) {
    result.ok = false;
  }

  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { result, screenshotPath };
}

function printFailureDetails(result) {
  for (const assertion of result.assertions ?? []) {
    if (!assertion.ok) process.stdout.write(`  assertion failed: ${assertion.message}\n`);
  }

  const consoleCounts = new Map();
  for (const entry of result.consoleErrors ?? []) {
    consoleCounts.set(entry, (consoleCounts.get(entry) ?? 0) + 1);
  }

  for (const err of result.errors ?? []) {
    const remaining = consoleCounts.get(err) ?? 0;
    if (remaining > 0) {
      consoleCounts.set(err, remaining - 1);
      continue;
    }
    process.stdout.write(`  error: ${err}\n`);
  }

  for (const cerr of result.consoleErrors ?? []) {
    process.stdout.write(`  console.error: ${cerr}\n`);
  }
}

async function main() {
  const { scenarios, list, outDir, theme, allThemes, settings } = parseArgs(process.argv.slice(2));
  const allNames = Object.keys(SCENARIOS);

  if (list) {
    for (const name of allNames) process.stdout.write(`${name}\n`);
    return;
  }

  const chromeBin = await findChrome();
  if (!chromeBin) {
    process.stdout.write("smoke: skipped (no Chrome binary)\n");
    return;
  }

  const harnessDir = await buildHarness();
  await mkdir(outDir, { recursive: true });
  const indexHtmlPath = resolve(harnessDir, "index.html");
  const targets = scenarios.length > 0 ? scenarios : allNames;
  const themes = allThemes ? ["light", "dark"] : [theme ?? "light"];

  let anyFailed = false;
  for (const name of targets) {
    for (const currentTheme of themes) {
      const { result, screenshotPath } = await runScenario({
        chromeBin,
        indexHtmlPath,
        outDir,
        name,
        theme: currentTheme,
        settings,
      });
      if (!result.ok) anyFailed = true;

      const label = result.ok ? "ok" : "FAIL";
      const assertionCount = Array.isArray(result.assertions) ? result.assertions.length : 0;
      const shownPath = relative(process.cwd(), screenshotPath) || screenshotPath;
      process.stdout.write(`${label} ${name} (${assertionCount} assertions) ${shownPath}\n`);

      if (!result.ok) {
        printFailureDetails(result);
      }
    }
  }

  if (anyFailed) process.exitCode = 1;
}

await main();
