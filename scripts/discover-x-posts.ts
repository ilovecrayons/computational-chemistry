import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type MediaType = "image" | "video" | "mixed" | "text" | "unknown";
type Category =
  | "brainrot"
  | "skibidi-toilet"
  | "larping"
  | "gooning"
  | "dating"
  | "political-shitposts"
  | "developer-humor";

type ArchivePost = {
  category: string;
  url: string;
  author: string;
  text: string;
  mediaType: MediaType;
};

type DiscoveryPost = ArchivePost & {
  citation: string;
  searchCall: number;
};

type SearchRequest = {
  call: number;
  category: Category;
  requested: number;
  input: string;
  tool: { type: "x_search"; enable_image_understanding: boolean; enable_video_understanding: boolean };
  responseId?: string;
  citations: string[];
  error?: string;
};

type DiscoveryFile = {
  version: 1;
  generatedAt: string;
  endpoint: string;
  model: "grok-4.6";
  targetCount: number;
  categories: Record<Category, { target: number; accepted: number }>;
  requests: SearchRequest[];
  responses: Array<{ call: number; raw: unknown }>;
  posts: DiscoveryPost[];
};

type RawResponse = {
  id?: unknown;
  output?: unknown;
  citations?: unknown;
  error?: unknown;
};

const endpoint = "https://api.x.ai/v1/responses";
const model = "grok-4.6" as const;
const archivePath = path.resolve("db/x-posts.json");
const defaultOutput = path.resolve("db/x-post-discovery.json");
const categories: Category[] = [
  "brainrot",
  "skibidi-toilet",
  "larping",
  "gooning",
  "dating",
  "political-shitposts",
  "developer-humor",
];
const defaultTargets: Record<Category, number> = {
  brainrot: 29,
  "skibidi-toilet": 29,
  larping: 29,
  gooning: 29,
  dating: 28,
  "political-shitposts": 28,
  "developer-humor": 28,
};
const mediaTypes = new Set<MediaType>([
  "image",
  "video",
  "mixed",
  "text",
  "unknown",
]);
const statusPattern =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)(?:[/?#].*)?$/i;
const citationStatusPattern =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/(?:i\/)?status\/(\d+)(?:[/?#]|$)/i;
const maxCallsDefault = 40;
const batchSizeDefault = 10;

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const equal = value.indexOf("=");
    if (equal !== -1) {
      args.set(value.slice(2, equal), value.slice(equal + 1));
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args.set(value.slice(2), argv[index + 1]);
      index += 1;
    } else {
      args.set(value.slice(2), true);
    }
  }
  return args;
}

function numberArg(args: Map<string, string | boolean>, key: string, fallback: number) {
  const value = args.get(key);
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${key} must be a positive integer`);
  return parsed;
}

function canonicalUrl(value: unknown): { url: string; statusId: string } | null {
  if (typeof value !== "string") return null;
  const match = statusPattern.exec(value.trim());
  if (!match) return null;
  return { url: `https://x.com/${match[1]}/status/${match[2]}`, statusId: match[2] };
}

function citationUrls(raw: RawResponse): string[] {
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
  collect(raw.citations);
  collect(raw.output);
  return [...new Set(urls)];
}

function outputText(raw: RawResponse): string {
  const chunks: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "output_text" && typeof record.text === "string") chunks.push(record.text);
    walk(record.content);
    walk(record.output);
  };
  walk(raw.output);
  return chunks.join("\n").trim();
}

function parsePosts(text: string): Array<Record<string, unknown>> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const firstObject = fenced.indexOf("{");
  const lastObject = fenced.lastIndexOf("}");
  if (firstObject < 0 || lastObject < firstObject) return [];
  try {
    const parsed = JSON.parse(fenced.slice(firstObject, lastObject + 1)) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const posts = (parsed as Record<string, unknown>).posts;
    if (!Array.isArray(posts)) return [];
    return posts.filter(
      (post): post is Record<string, unknown> => Boolean(post && typeof post === "object"),
    );
  } catch {
    return [];
  }
}

function safeText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length >= 2 && text.length <= 4000 && !/\[\+\d+\s+chars?\]/i.test(text);
}

function mediaType(value: unknown): MediaType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "photo" || normalized === "picture") return "image";
  if (normalized === "gif") return "mixed";
  return mediaTypes.has(normalized as MediaType) ? (normalized as MediaType) : null;
}

function candidateText(candidate: Record<string, unknown>) {
  const value = candidate.text ?? candidate.postText ?? candidate.content;
  return typeof value === "string" ? value.trim() : "";
}

function candidateAuthor(candidate: Record<string, unknown>) {
  const value = candidate.author ?? candidate.handle ?? candidate.username;
  return typeof value === "string" ? value.trim() : "";
}

function candidateUrl(candidate: Record<string, unknown>) {
  return candidate.url ?? candidate.canonicalUrl ?? candidate.statusUrl;
}

function promptMediaType(candidate: Record<string, unknown>) {
  return candidate.mediaType ?? candidate.media_type ?? candidate.media;
}

const searchAngles: Record<Category, string[]> = {
  brainrot: [
    "brainrot meme posts, absurd slang, and surreal internet jokes",
    "viral brainrot catchphrases and playful nonsense posts",
    "absurdist Gen-Z meme humor without protected-class targeting",
  ],
  "skibidi-toilet": [
    "Skibidi Toilet fandom jokes, edits, and playful toilet humor",
    "skibidi, sigma, rizz, and related surreal meme posts",
    "safe fan-made Skibidi Toilet reaction memes and one-liners",
  ],
  larping: [
    "people joking about larping, role-playing, or pretending online",
    "self-aware larping and poser jokes from ordinary users",
    "relatable internet identity-performance and productivity-larp memes",
  ],
  gooning: [
    "non-graphic adult doomscrolling jokes and compulsive internet humor",
    "safe adult slang jokes about being stuck online for too long",
    "non-graphic adult meme posts about internet compulsion and scrolling",
  ],
  dating: [
    "dating-app jokes, awkward dates, and relatable modern romance memes",
    "single life, flirting, texting, and dating-culture humor",
    "self-deprecating adult dating mishaps without harassment",
  ],
  "political-shitposts": [
    "satirical political shitposts and public-policy meme jokes",
    "non-graphic political parody, absurd campaign humor, and civic memes",
    "public-figure political satire without protected-class hate or threats",
  ],
  "developer-humor": [
    "programmer jokes, software engineering memes, and debugging humor",
    "coding, git, deployment, and developer workplace meme posts",
    "safe web-development and computer-science one-liners",
  ],
};

function buildInput(category: Category, requested: number, knownStatusIds: Set<string>) {
  const angles = searchAngles[category];
  const angle = angles[Math.floor(knownStatusIds.size / 10) % angles.length];
  const exclusions = [...knownStatusIds].slice(-80).join(", ");
  return [
    `Use X Search to find exactly ${requested} distinct, genuine public X posts for the safe adult meme archive category "${category}".`,
    `Search angle: ${angle}.`,
    "Every result MUST be a standalone joke, absurd meme, or playful shitpost that is funny on its own—not an earnest description, news item, explainer, commentary, sincere narrative, or generic post about a topic.",
    "Do not return advertisements, product or creator promotions, launches, giveaways, sponsorships, legal disputes, court coverage, government or news reporting, documentaries, educational explainers, or posts that are only hashtags, links, or promotional calls to action.",
    "For gooning specifically, accept only ironic, non-graphic internet-compulsion or doomscrolling humor; reject explicit sexual content, fetish promotion, adult-creator promotion, and sexual solicitation.",
    "For every result, copy the exact canonical URL (https://x.com/<handle>/status/<numeric-id>), the displayed author, and the verbatim post text. Set mediaType to exactly one of image, video, mixed, text, unknown based on the retrieved post.",
    "Do not return replies without a canonical status URL, quoted material as a separate invented post, private/deleted/unclear posts, protected-class hate, graphic sexual imagery, or graphic violence.",
    "Each URL must be directly supported by a citation in this response. Never invent a status ID. Return JSON only as {\"posts\":[{\"url\":\"...\",\"author\":\"...\",\"text\":\"...\",\"mediaType\":\"...\"}]}",
    exclusions ? `Do not repeat these already-used status IDs: ${exclusions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function categoryTargets(args: Map<string, string | boolean>, target: number) {
  const values = { ...defaultTargets };
  const each = Math.floor(target / categories.length);
  let remainder = target % categories.length;
  for (const category of categories) {
    values[category] = each + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }
  const onlyCategory = args.get("category");
  if (typeof onlyCategory === "string") {
    if (!categories.includes(onlyCategory as Category))
      throw new Error(`Unknown --category ${onlyCategory}`);
    for (const category of categories)
      values[category] = category === onlyCategory ? values[category] : 0;
  }
  return values;
}

function printUsage() {
  console.log(
    "Usage: tsx --env-file-if-exists=.env scripts/discover-x-posts.ts [--target 200] [--max-calls 40] [--batch-size 10] [--parallel 3] [--output db/x-post-discovery.json] [--category CATEGORY]",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printUsage();
    return;
  }
  if (args.has("only"))
    throw new Error("--only is not supported; use --category CATEGORY.");
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey)
    throw new Error("XAI_API_KEY is required and must be provided server-side.");
  const target = numberArg(args, "target", 200);
  const maxCalls = numberArg(args, "max-calls", maxCallsDefault);
  const batchSize = Math.min(numberArg(args, "batch-size", batchSizeDefault), 20);
  const parallel = Math.min(numberArg(args, "parallel", 3), 4);
  const output = path.resolve(
    typeof args.get("output") === "string" ? String(args.get("output")) : defaultOutput,
  );
  const targets = categoryTargets(args, target);
  const archive = JSON.parse(await readFile(archivePath, "utf8")) as {
    posts?: ArchivePost[];
  };
  const knownStatusIds = new Set<string>();
  for (const post of archive.posts ?? []) {
    const canonical = canonicalUrl(post.url);
    if (canonical) knownStatusIds.add(canonical.statusId);
  }
  const posts: DiscoveryPost[] = [];
  const requests: SearchRequest[] = [];
  const responses: Array<{ call: number; raw: unknown }> = [];
  const countFor = (category: Category) =>
    posts.filter((post) => post.category === category).length;
  let call = 0;
  try {
    const prior = JSON.parse(await readFile(output, "utf8")) as Partial<DiscoveryFile>;
    if (
      prior.version === 1 &&
      prior.targetCount === target &&
      Array.isArray(prior.posts) &&
      Array.isArray(prior.requests) &&
      Array.isArray(prior.responses)
    ) {
      posts.push(...(prior.posts as DiscoveryPost[]));
      requests.push(...(prior.requests as SearchRequest[]));
      responses.push(...(prior.responses as Array<{ call: number; raw: unknown }>));
      const completedCalls = new Set(responses.map((response) => response.call));
      for (const request of requests) {
        if (!completedCalls.has(request.call) && !request.error) {
          request.error =
            "No response was recorded after the attempt checkpoint; outcome unknown.";
        }
      }
      for (const post of posts) {
        const canonical = canonicalUrl(post.url);
        if (canonical) knownStatusIds.add(canonical.statusId);
      }
      call = requests.reduce((maximum, request) => Math.max(maximum, request.call), 0);
      console.log(`Resuming ${posts.length}/${target} posts from ${output}.`);
    }
  } catch {
    // A missing or malformed checkpoint is ignored; a fresh bounded run starts below.
  }

  const saveCheckpoint = async () => {
    const counts = Object.fromEntries(
      categories.map((category) => [
        category,
        { target: targets[category], accepted: countFor(category) },
      ]),
    ) as Record<Category, { target: number; accepted: number }>;
    const discovery: DiscoveryFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      endpoint,
      model,
      targetCount: target,
      categories: counts,
      requests,
      responses,
      posts,
    };
    await mkdir(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");
    await rename(temporary, output);
  };

  while (categories.some((category) => countFor(category) < targets[category])) {
    const planned = new Set<Category>();
    const pending: Array<{
      record: SearchRequest;
      start: () => Promise<RawResponse>;
    }> = [];
    let maxCallsReached = false;
    while (pending.length < parallel) {
      const category = categories.find(
        (candidate) =>
          !planned.has(candidate) &&
          countFor(candidate) < targets[candidate],
      );
      if (!category) break;
      if (call >= maxCalls) {
        maxCallsReached = true;
        break;
      }
      const categoryBatchSize = category === "gooning" ? Math.min(batchSize, 5) : batchSize;
      const requested = Math.min(categoryBatchSize, targets[category] - countFor(category));
      call += 1;
      planned.add(category);
      const input = buildInput(category, requested, knownStatusIds);
      const tool = {
        type: "x_search" as const,
        enable_image_understanding: false,
        enable_video_understanding: false,
      };
      const record: SearchRequest = {
        call,
        category,
        requested,
        input,
        tool,
        citations: [],
      };
      requests.push(record);
      pending.push({
        record,
        start: () =>
          fetch(endpoint, {
            method: "POST",
            signal: AbortSignal.timeout(180_000),
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              input: [{ role: "user", content: input }],
              tools: [tool],
              temperature: 0,
              max_output_tokens: 8000,
            }),
          }).then(async (response) => {
            const raw = (await response.json()) as RawResponse;
            if (!response.ok)
              throw new Error(`xAI request failed with HTTP ${response.status}.`);
            return raw;
          }),
      });
    }
    if (pending.length) await saveCheckpoint();
    const settled = await Promise.allSettled(
      pending.map(async (request) => ({
        request,
        raw: await request.start(),
      })),
    );
    let rejected: unknown;
    for (const [index, result] of settled.entries()) {
      if (result.status === "rejected") {
        rejected ??= result.reason;
        const request = pending[index].record;
        request.error =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        await saveCheckpoint();
        continue;
      }
      const request = result.value.request.record;
      const { raw } = result.value;
      responses.push({ call: request.call, raw });
      const citations = citationUrls(raw);
      request.responseId = typeof raw.id === "string" ? raw.id : undefined;
      request.citations = citations;
      const citationByStatus = new Map<string, string>();
      for (const citation of citations) {
        const match = citationStatusPattern.exec(citation);
        if (match && !citationByStatus.has(match[1]))
          citationByStatus.set(match[1], citation);
      }
      for (const candidate of parsePosts(outputText(raw))) {
        const canonical = canonicalUrl(candidateUrl(candidate));
        const author = candidateAuthor(candidate);
        const text = candidateText(candidate);
        const resolvedMediaType = mediaType(promptMediaType(candidate));
        if (
          !canonical ||
          !citationByStatus.has(canonical.statusId) ||
          !author ||
          !safeText(text) ||
          !resolvedMediaType ||
          knownStatusIds.has(canonical.statusId) ||
          countFor(request.category) >= targets[request.category]
        )
          continue;
        knownStatusIds.add(canonical.statusId);
        posts.push({
          category: request.category,
          url: canonical.url,
          author,
          text,
          mediaType: resolvedMediaType,
          citation: citationByStatus.get(canonical.statusId) as string,
          searchCall: request.call,
        });
      }
      await saveCheckpoint();
      console.log(
        `X search ${request.call}/${maxCalls}: ${request.category} accepted ${countFor(request.category)}/${targets[request.category]} (${citations.length} citations). Checkpointed ${posts.length}/${target}.`,
      );
    }
    if (rejected) throw rejected;
    if (maxCallsReached && categories.some((category) => countFor(category) < targets[category])) {
      await saveCheckpoint();
      throw new Error(
        `Discovery stopped at ${posts.length}/${target}: max calls (${maxCalls}) reached before category quotas were filled.`,
      );
    }
  }

  await saveCheckpoint();
  console.log(
    `Saved ${posts.length} citation-verified new X posts across ${requests.length} recorded request attempts (${responses.length} completed raw responses) to ${output}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "X discovery failed.");
  process.exitCode = 1;
});
