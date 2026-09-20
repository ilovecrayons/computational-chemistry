import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const archivePath = path.resolve("db/x-posts.json");
const defaultDiscoveryPath = path.resolve("db/x-post-discovery.json");
const expectedArchiveCount = 239;
const expectedDiscoveryTargets = {
  brainrot: 29,
  "skibidi-toilet": 29,
  larping: 29,
  gooning: 29,
  dating: 28,
  "political-shitposts": 28,
  "developer-humor": 28,
} as const;
const statusPattern = /^https:\/\/x\.com\/[^/]+\/status\/(\d+)$/;
const citationPattern =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/(?:i\/)?status\/(\d+)(?:[/?#]|$)/i;
const mediaTypes = new Set(["image", "video", "mixed", "text", "unknown"]);

type ArchivePost = {
  category: string;
  url: string;
  author: string;
  text: string;
  mediaType: "image" | "video" | "mixed" | "text" | "unknown";
};

type DiscoveryPost = ArchivePost & {
  citation: string;
  searchCall: number;
};

type DiscoveryFile = {
  version: number;
  generatedAt: string;
  endpoint: string;
  model: string;
  targetCount: number;
  categories: Record<string, { target: number; accepted: number }>;
  requests: Array<{
    call: number;
    category: string;
    responseId?: string;
    citations: string[];
    error?: string;
  }>;
  responses: Array<{ call: number; raw: unknown }>;
  posts: DiscoveryPost[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const equal = value.indexOf("=");
    if (equal !== -1) args.set(value.slice(2, equal), value.slice(equal + 1));
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args.set(value.slice(2), argv[index + 1]);
      index += 1;
    } else args.set(value.slice(2), true);
  }
  return args;
}

function canonicalStatusId(url: string) {
  const match = statusPattern.exec(url);
  return match?.[1] ?? null;
}

function citationStatusId(citation: string) {
  return citation.match(citationPattern)?.[1] ?? null;
}

function citationUrls(raw: unknown): string[] {
  const urls: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (
          key === "url" ||
          key === "uri" ||
          key === "citations" ||
          key === "annotations" ||
          key === "content"
        )
          collect(nested);
      }
    }
  };
  if (raw && typeof raw === "object") {
    const response = raw as Record<string, unknown>;
    collect(response.citations);
    collect(response.output);
  }
  return [...new Set(urls)];
}

function validatePost(post: DiscoveryPost) {
  const statusId = canonicalStatusId(post.url);
  if (
    !statusId ||
    !post.author.trim() ||
    !post.text.trim() ||
    !mediaTypes.has(post.mediaType) ||
    citationStatusId(post.citation) !== statusId
  ) {
    throw new Error(`Invalid citation-grounded discovery post: ${post.url}`);
  }
  return statusId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const discoveryPath = path.resolve(
    typeof args.get("input") === "string"
      ? String(args.get("input"))
      : defaultDiscoveryPath,
  );
  const archive = JSON.parse(await readFile(archivePath, "utf8")) as {
    version: number;
    source: Record<string, unknown>;
    posts: ArchivePost[];
  };
  const discovery = JSON.parse(await readFile(discoveryPath, "utf8")) as DiscoveryFile;
  if (archive.version !== 1 || !Array.isArray(archive.posts))
    throw new Error("Invalid archive file.");
  if (discovery.version !== 1 || discovery.model !== "grok-4.6")
    throw new Error("Invalid Grok discovery provenance.");
  if (discovery.posts.length !== 200 || discovery.targetCount !== 200)
    throw new Error("Discovery file must contain exactly 200 new posts.");
  const expectedCategories = Object.keys(expectedDiscoveryTargets);
  if (
    Object.keys(discovery.categories).length !== expectedCategories.length ||
    expectedCategories.some((category) => {
      const summary = discovery.categories[category];
      const expected = expectedDiscoveryTargets[category as keyof typeof expectedDiscoveryTargets];
      return summary?.target !== expected || summary.accepted !== expected;
    }) ||
    Object.keys(discovery.categories).some(
      (category) => !(category in expectedDiscoveryTargets),
    )
  )
    throw new Error("Discovery category quotas are incomplete or inaccurate.");
  const requestsByCall = new Map<number, DiscoveryFile["requests"][number]>();
  for (const request of discovery.requests) {
    if (!Number.isInteger(request.call) || request.call < 1)
      throw new Error(`Invalid discovery request call: ${request.call}`);
    if (requestsByCall.has(request.call))
      throw new Error(`Duplicate discovery request call: ${request.call}`);
    requestsByCall.set(request.call, request);
  }
  const responsesByCall = new Map<number, DiscoveryFile["responses"][number]>();
  const responseCitationsByCall = new Map<number, Set<string>>();
  for (const response of discovery.responses) {
    if (!Number.isInteger(response.call) || response.call < 1)
      throw new Error(`Invalid discovery response call: ${response.call}`);
    if (responsesByCall.has(response.call))
      throw new Error(`Duplicate discovery response call: ${response.call}`);
    const request = requestsByCall.get(response.call);
    if (!request)
      throw new Error(`Raw discovery response has no matching request: ${response.call}`);
    if (request.responseId) {
      const rawId =
        response.raw && typeof response.raw === "object" && "id" in response.raw
          ? response.raw.id
          : undefined;
      if (rawId !== request.responseId)
        throw new Error(`Raw response ID does not match request: ${response.call}`);
    }
    responsesByCall.set(response.call, response);
    responseCitationsByCall.set(response.call, new Set(citationUrls(response.raw)));
  }
  for (const request of discovery.requests) {
    if (!request.error && !responsesByCall.has(request.call))
      throw new Error(`Successful discovery request lacks raw response: ${request.call}`);
  }
  const discoveredCategoryCounts = discovery.posts.reduce<Record<string, number>>(
    (counts, post) => {
      counts[post.category] = (counts[post.category] ?? 0) + 1;
      return counts;
    },
    {},
  );
  if (
    Object.keys(discoveredCategoryCounts).some(
      (category) => !(category in expectedDiscoveryTargets),
    ) ||
    expectedCategories.some(
      (category) =>
        discoveredCategoryCounts[category] !==
        expectedDiscoveryTargets[category as keyof typeof expectedDiscoveryTargets],
    )
  )
    throw new Error("Discovery posts do not satisfy the required category quotas.");
  const seen = new Set<string>();
  for (const post of archive.posts) {
    const statusId = canonicalStatusId(post.url);
    if (!statusId || seen.has(statusId))
      throw new Error(`Invalid or duplicate archive post: ${post.url}`);
    seen.add(statusId);
  }
  const discovered = discovery.posts.map((post) => {
    const statusId = validatePost(post);
    const request = requestsByCall.get(post.searchCall);
    const responseCitations = responseCitationsByCall.get(post.searchCall);
    if (
      !request ||
      request.error ||
      request.category !== post.category ||
      !responseCitations ||
      !responseCitations.has(post.citation) ||
      !request.citations.includes(post.citation) ||
      !request.citations.some((citation) => citationStatusId(citation) === statusId)
    )
      throw new Error(`Discovery post lacks raw citation provenance: ${post.url}`);
    if (seen.has(statusId)) throw new Error(`Discovery repeats existing status: ${statusId}`);
    seen.add(statusId);
    return {
      category: post.category,
      url: post.url,
      author: post.author,
      text: post.text,
      mediaType: post.mediaType,
    } satisfies ArchivePost;
  });
  const posts = [...archive.posts, ...discovered];
  if (posts.length !== expectedArchiveCount)
    throw new Error(`Archive would contain ${posts.length}; expected ${expectedArchiveCount}.`);

  const categoryCounts = posts.reduce<Record<string, number>>((counts, post) => {
    counts[post.category] = (counts[post.category] ?? 0) + 1;
    return counts;
  }, {});
  const next = {
    version: 1,
    source: {
      ...archive.source,
      model: discovery.model,
      selection:
        "Approved Top-ranked X Search results, one post per result, preserving citation-grounded canonical URL, author, verbatim text, and media type.",
      provenance: {
        path: path.relative(process.cwd(), discoveryPath),
        endpoint: discovery.endpoint,
        model: discovery.model,
        discoveredAt: discovery.generatedAt,
        recordedRequests: discovery.requests.length,
        completedResponses: discovery.responses.length,
        callAccounting:
          "Recorded request attempts and completed responses only; unrecorded or abandoned calls are unknown.",
        citations: discovery.requests.reduce((count, request) => count + request.citations.length, 0),
        rawResponses: discovery.responses.length,
      },
    },
    posts,
  };
  const dryRun = args.has("dry-run") || args.has("check");
  console.log(
    `${dryRun ? "Validated" : "Prepared"} ${posts.length} archive posts (${discovered.length} new) from ${discovery.requests.length} recorded request attempts (${discovery.responses.length} completed raw responses).`,
  );
  console.log(`Category counts: ${JSON.stringify(categoryCounts)}`);
  if (dryRun) {
    console.log("Dry run: db/x-posts.json was not modified.");
    return;
  }
  const temporary = `${archivePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, archivePath);
  console.log(`Synchronized ${archivePath} atomically.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Archive sync failed.");
  process.exitCode = 1;
});
