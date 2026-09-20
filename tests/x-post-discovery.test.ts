import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type ChildResult = {
  code: number | null;
  output: string;
};

const workspace = process.cwd();
const tsxBin = path.join(
  workspace,
  "node_modules/.bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const discoveryScript = path.join(workspace, "scripts/discover-x-posts.ts");
type DiscoveryRunOptions = {
  category?: string;
};

async function runDiscovery(
  outputPath: string,
  shimPath: string,
  checkpointPath: string,
  logPath: string,
  options: DiscoveryRunOptions = {},
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const nodeOptions = [
      process.env.NODE_OPTIONS?.trim(),
      `--import=${shimPath}`,
    ]
      .filter(Boolean)
      .join(" ");
    const args = [
      discoveryScript,
      "--target",
      "7",
      "--max-calls",
      "1",
      "--parallel",
      "3",
      "--batch-size",
      "1",
      ...(options.category ? ["--category", options.category] : []),
      "--output",
      outputPath,
    ];
    const child = spawn(
      tsxBin,
      args,
      {
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions,
          XAI_API_KEY: "fake-key-never-sent-to-a-network",
          DISCOVERY_CHECKPOINT: checkpointPath,
          DISCOVERY_FETCH_LOG: logPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

test("bounded X discovery preserves partial responses and never reuses an uncertain call", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "memeant-x-discovery-"));
  const outputPath = path.join(directory, "discovery.json");
  const shimPath = path.join(directory, "fetch-shim.mjs");
  const logPath = path.join(directory, "fetch.log");
  await writeFile(
    shimPath,
    `import { appendFileSync, existsSync } from "node:fs";
appendFileSync(process.env.DISCOVERY_FETCH_LOG, "shim-loaded\\n");
const response = {
  id: "response-1",
  citations: ["https://x.com/i/status/998877665544332211"],
  output: [{
    type: "message",
    content: [{
      type: "output_text",
      text: JSON.stringify({ posts: [{
        url: "https://x.com/example/status/998877665544332211",
        author: "@example",
        text: "A deterministic fake discovery result.",
        mediaType: "text"
      }] })
    }]
  }]
};
globalThis.fetch = async () => {
  appendFileSync(process.env.DISCOVERY_FETCH_LOG, "fetch\\n");
  appendFileSync(process.env.DISCOVERY_FETCH_LOG, existsSync(process.env.DISCOVERY_CHECKPOINT) ? "checkpoint-present\\n" : "checkpoint-missing\\n");
  return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
};
`,
    "utf8",
  );

  try {
    const first = await runDiscovery(outputPath, shimPath, outputPath, logPath);
    assert.notEqual(first.code, 0);
    assert.match(first.output, /max calls/i);
    const firstState = JSON.parse(await readFile(outputPath, "utf8")) as {
      requests: Array<{ call: number; responseId?: string; error?: string }>;
      responses: Array<{ call: number; raw: unknown }>;
      posts: unknown[];
    };
    assert.equal(firstState.requests.length, 1);
    assert.equal(firstState.requests[0].call, 1);
    assert.equal(firstState.requests[0].responseId, "response-1");
    assert.equal(firstState.responses.length, 1);
    assert.equal(firstState.responses[0].call, 1);
    assert.equal(firstState.posts.length, 1);
    const firstLog = await readFile(logPath, "utf8");
    assert.equal(firstLog.match(/^fetch$/gm)?.length, 1);
    assert.match(firstLog, /checkpoint-present/);

    const second = await runDiscovery(outputPath, shimPath, outputPath, logPath);
    assert.notEqual(second.code, 0);
    const secondLog = await readFile(logPath, "utf8");
    assert.equal(secondLog.match(/^fetch$/gm)?.length, 1);
    const secondState = JSON.parse(await readFile(outputPath, "utf8")) as {
      requests: unknown[];
      responses: unknown[];
    };
    assert.equal(secondState.requests.length, 1);
    assert.equal(secondState.responses.length, 1);

    const interruptedState = {
      ...firstState,
      requests: firstState.requests.map(({ responseId: _responseId, ...request }) => request),
      responses: [],
    };
    await writeFile(outputPath, `${JSON.stringify(interruptedState)}\n`, "utf8");
    const third = await runDiscovery(outputPath, shimPath, outputPath, logPath);
    assert.notEqual(third.code, 0);
    const thirdLog = await readFile(logPath, "utf8");
    assert.equal(thirdLog.match(/^fetch$/gm)?.length, 1);
    const thirdState = JSON.parse(await readFile(outputPath, "utf8")) as {
      requests: Array<{ error?: string }>;
      responses: unknown[];
    };
    assert.equal(thirdState.responses.length, 0);
    assert.match(thirdState.requests[0]?.error ?? "", /outcome unknown/i);
    const singleOutputPath = path.join(directory, "single-category.json");
    const singleLogPath = path.join(directory, "single-category.fetch.log");
    const single = await runDiscovery(
      singleOutputPath,
      shimPath,
      singleOutputPath,
      singleLogPath,
      { category: "brainrot" },
    );
    assert.equal(single.code, 0);
    const singleState = JSON.parse(await readFile(singleOutputPath, "utf8")) as {
      requests: unknown[];
      responses: unknown[];
      posts: unknown[];
    };
    assert.equal(singleState.requests.length, 1);
    assert.equal(singleState.responses.length, 1);
    assert.equal(singleState.posts.length, 1);
    const singleLog = await readFile(singleLogPath, "utf8");
    assert.equal(singleLog.match(/^fetch$/gm)?.length, 1);
    assert.match(singleLog, /checkpoint-present/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
