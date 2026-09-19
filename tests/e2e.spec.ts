import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type {
  ChatMessage,
  Match,
  Me,
  Meme,
  Tasteprint,
  XPost,
} from "../lib/contracts";

const demoEmail = "alex@demo.local";
const demoPassword = "Memeant-demo-2026!";
const startingTags = ["absurd", "cursed", "deadpan"];
type FeedResponse = {
  memes: Meme[];
  nextCursor: string | null;
  reactionCount: number;
};

type OfficialMeme = Extract<Meme, { type: "x" }>;

function expectOfficialXPost(meme: Meme): OfficialMeme {
  expect(meme.type).toBe("x");
  if (meme.type !== "x") throw new Error(`Expected official X post: ${meme.id}`);
  expect(meme.src).toBeNull();
  expect(meme.poster).toBeNull();
  expect(meme.xPost.id).toMatch(/^\d+$/);
  const source = new URL(meme.xPost.url);
  expect(source.protocol).toBe("https:");
  expect(["x.com", "twitter.com"]).toContain(
    source.hostname.replace(/^www\./, ""),
  );
  expect(source.pathname).toMatch(new RegExp(`/status/${meme.xPost.id}/?$`));
  return meme;
}

test.describe.configure({ mode: "serial" });

test.use({
  extraHTTPHeaders: async ({ contextOptions }, use) => {
    // Better Auth defaults to x-forwarded-for and groups IPv6 clients by /64.
    // Keep one budget per test across browser/API calls, with a fresh subnet on reruns.
    const subnet = randomBytes(6).toString("hex");
    await use({
      ...contextOptions.extraHTTPHeaders,
      "x-forwarded-for": `fd00:${subnet.slice(0, 4)}:${subnet.slice(4, 8)}:${subnet.slice(8, 12)}::1`,
    });
  },
});

async function signInFreshDemo(page: Page, baseURL: string) {
  // Precondition only: restore the real persisted fixture, then exercise sign-in in the browser.
  const headers = { Origin: new URL(baseURL).origin };
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email: demoEmail, password: demoPassword },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const reset = await page.request.post("/api/admin/demo-reset", {
    headers,
    data: {},
  });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  const logout = await page.request.post("/api/auth/sign-out", {
    headers,
    data: {},
  });
  expect(logout.ok(), await logout.text()).toBeTruthy();

  await page.goto("/");
  await page
    .getByRole("button", { name: "I have an account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(demoEmail);
  await page.getByLabel("Password", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  const before = await page.request.get("/api/profile");
  expect(before.ok()).toBeTruthy();
  const profileData = (await before.json()) as Me;
  expect(profileData.profile?.complete).toBe(false);
}

async function completeProfile(page: Page) {
  await page.getByLabel("Display name", { exact: true }).fill("Alex");
  await page.getByLabel(/^Date of birth/).fill("1999-04-12");
  await page
    .getByRole("combobox", { name: /^Country/ })
    .selectOption("US");
  await page
    .getByRole("combobox", { name: /^State or province/ })
    .selectOption("NY");
  await page.getByLabel(/^Town/).selectOption({ label: "Albany" });
  await page
    .getByRole("textbox", { name: "Bio", exact: true })
    .fill("I collect terrible work memes and excellent tiny snacks.");
  await page
    .getByRole("textbox", { name: /^Interests/ })
    .fill("memes, snacks");
  await page
    .getByRole("combobox", { name: "Gender", exact: true })
    .selectOption("nonbinary");
  await page
    .getByRole("combobox", { name: "Looking for", exact: true })
    .selectOption("relationship");
  const preferences = page.getByRole("group", { name: /Meet people who are/ });
  for (const gender of ["woman", "man", "nonbinary"]) {
    const choice = preferences.getByRole("button", {
      name: gender,
      exact: true,
    });
    if ((await choice.getAttribute("aria-pressed")) !== "true")
      await choice.click();
  }
  await page.getByLabel("Minimum age", { exact: true }).fill("18");
  await page.getByLabel("Maximum age", { exact: true }).fill("45");
  await page
    .getByRole("combobox", { name: "Match radius", exact: true })
    .selectOption("100");
  const existingPhotos = page.getByRole("button", {
    name: "Remove",
    exact: true,
  });
  for (let count = await existingPhotos.count(); count > 0; count -= 1)
    await existingPhotos.first().click();
  await page.getByLabel("Choose files").setInputFiles("tests/fixture-photo.jpg");
  await page
    .getByRole("button", { name: "Next: your humor", exact: true })
    .click();
  const tags = page.getByRole("group", {
    name: "Three starting humor tags",
    exact: true,
  });
  for (const tag of [
    "absurd",
    "wholesome",
    "cursed",
    "deadpan",
    "dark",
    "cringe",
  ]) {
    const choice = tags.getByRole("button", { name: tag, exact: true });
    if ((await choice.getAttribute("aria-pressed")) === "true")
      await choice.click();
  }
  for (const tag of startingTags)
    await tags.getByRole("button", { name: tag, exact: true }).click();
  await expect(tags.getByRole("button", { pressed: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Judge memes", exact: true }).click();
  await expect(
    page.locator(
      "article.feed-post-active[data-post-id] button.feed-reaction",
    ),
  ).toHaveCount(3);
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test("real reactions create an explainable match from official X posts", async ({
  page,
  baseURL,
}) => {
  await signInFreshDemo(page, baseURL!);
  // The real iframe is manually verified separately; this keeps browser coverage
  // focused on our source DTO and honest fallback when X is unavailable.
  await page.route("https://platform.twitter.com/**", (route) => route.abort());
  await completeProfile(page);
  const reactedIds = new Set<string>();
  const reactedTags = new Set<string>();
  const reactedSources = new Map<string, XPost>();
  let reactionRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/reactions" &&
      request.method() === "POST"
    )
      reactionRequests += 1;
  });

  for (let index = 0; index < 15; index += 1) {
    const initialCard = page.locator(
      "article.feed-post-active[data-post-id]",
    );
    await expect(initialCard).toHaveCount(1);
    const initialId = await initialCard.getAttribute("data-post-id");
    if (!initialId) throw new Error("The active feed post has no stable id.");
    const beforeResponse = await page.request.get(
      `/api/posts/${encodeURIComponent(initialId)}`,
    );
    expect(beforeResponse.ok(), await beforeResponse.text()).toBeTruthy();
    const before = (await beforeResponse.json()) as { meme: Meme };
    const initialMeme = before.meme;
    const initialOfficial = expectOfficialXPost(initialMeme);
    await expect(initialCard.locator(".x-embed-heading strong")).toHaveText(
      initialOfficial.xPost.author,
    );

    if (index === 0) {
      expect(reactionRequests).toBe(0);
      await page.locator(".feed-scroll").evaluate((element) => {
        const max = Math.max(element.scrollHeight - element.clientHeight, 0);
        const distance = Math.min(element.clientHeight / 2, max);
        element.scrollTop = Math.min(element.scrollTop + distance, max);
      });
      await expect
        .poll(async () => {
          const response = await page.request.get("/api/feed");
          const responseData = (await response.json()) as FeedResponse;
          return responseData.reactionCount;
        })
        .toBe(0);
      expect(reactionRequests).toBe(0);
      await initialCard.evaluate((element) =>
        element.scrollIntoView({ behavior: "auto", block: "start" }),
      );
      await expect
        .poll(() =>
          page
            .locator("article.feed-post-active[data-post-id]")
            .getAttribute("data-post-id"),
        )
        .toBe(initialId);
    }

    const activeCard = page.locator("article.feed-post-active[data-post-id]");
    await expect(activeCard).toHaveCount(1);
    const memeId = await activeCard.getAttribute("data-post-id");
    if (!memeId) throw new Error("The active feed post has no stable id.");
    expect(memeId).toBe(initialId);
    const official = expectOfficialXPost(initialMeme);
    await expect(activeCard.locator(".x-embed-heading strong")).toHaveText(
      official.xPost.author,
    );
    await expect(activeCard.locator("button.feed-reaction")).toHaveCount(3);
    const like = activeCard.locator("button.feed-reaction.like");
    await expect(like).toBeEnabled();

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/reactions" &&
        response.request().method() === "POST",
    );
    await like.click();
    const response = await saved;
    expect(response.ok(), await response.text()).toBeTruthy();
    const reaction = (await response.json()) as {
      tags: string[];
      reactionCount: number;
    };
    const requestBody = response.request().postDataJSON() as { memeId: string };
    expect(requestBody.memeId).toBe(memeId);
    expect(reactedIds.has(memeId)).toBe(false);
    reactedIds.add(memeId);
    reactedSources.set(memeId, official.xPost);
    for (const tag of reaction.tags) reactedTags.add(tag);
    expect(reaction.reactionCount).toBe(index + 1);
    await expect
      .poll(() =>
        page
          .locator("article.feed-post-active[data-post-id]")
          .getAttribute("data-post-id"),
      )
      .not.toBe(memeId);
  }
  expect(reactedIds.size).toBe(15);
  expect(reactedSources.size).toBe(15);

  const tasteResponse = await page.request.get("/api/tasteprint");
  expect(tasteResponse.ok()).toBeTruthy();
  const taste = (await tasteResponse.json()) as Tasteprint;
  expect(taste.reactionCount).toBe(15);
  expect(taste.positiveCount).toBe(15);
  expect(taste.calibrated).toBe(true);
  for (const item of taste.tags) expect(reactedTags.has(item.tag)).toBe(true);

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Discover", exact: true })
    .click();
  await expect(
    page.locator(".discover-feed").getByRole("heading", { name: /^Jules Bennett,/ }),
  ).toBeVisible();
  const matched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/profile-decisions" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Match", exact: true }).click();
  const matchResponse = await matched;
  expect(matchResponse.ok()).toBeTruthy();
  const { match } = (await matchResponse.json()) as { match: Match };
  expect(match.profile.name).toBe("Jules Bennett");
  const sharedMeme = match.compatibility.sharedMemes[0];
  if (!sharedMeme) throw new Error("The explainable match has no shared post.");
  const sharedOfficial = expectOfficialXPost(sharedMeme);
  expect(reactedSources.get(sharedMeme.id)).toEqual(sharedOfficial.xPost);
  const reveal = page.getByRole("dialog", {
    name: "It’s mutual.",
    exact: true,
  });
  await expect(reveal).toBeVisible();
  await expect
    .poll(() =>
      reveal.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      reveal.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await reveal
    .getByRole("button", { name: "Say something", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Jules Bennett", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  const messagesPath = `/api/matches/${match.id}/messages`;
  let automaticSends = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === messagesPath &&
      request.method() === "POST"
    )
      automaticSends += 1;
  });
  const openerButton = page.locator("button.suggested-opener");
  await expect(openerButton).toBeVisible();
  const opener = (await openerButton.textContent() ?? "")
    .replace(/[“”]/g, "")
    .trim();
  expect(opener).not.toBe("");
  await openerButton.click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(opener);
  const unsent = await page.request.get(messagesPath);
  expect(unsent.ok()).toBeTruthy();
  const unsentData = (await unsent.json()) as { messages: ChatMessage[] };
  expect(unsentData.messages).toEqual([]);
  expect(automaticSends).toBe(0);
  await expect(page.locator(".check-row input[type=checkbox]")).toBeChecked();
  const sent = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === messagesPath &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const sentResponse = await sent;
  expect(sentResponse.ok()).toBeTruthy();
  const { message } = (await sentResponse.json()) as { message: ChatMessage };
  expect(message.body).toBe(opener);
  expect(message.memeId).toBe(sharedMeme.id);
  await expect(
    page.locator(".message").getByText(opener, { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message-reference")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`chat=${match.id}`));
  await expect(
    page.locator(".message").getByText(opener, { exact: true }),
  ).toBeVisible();
  const persisted = await page.request.get(messagesPath);
  expect(persisted.ok()).toBeTruthy();
  const persistedData = (await persisted.json()) as {
    messages: ChatMessage[];
  };
  expect(persistedData.messages).toEqual([message]);
  await page
    .getByRole("button", { name: "Back to chats", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Jules/ })).toContainText(
    opener,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /Jules/ })).toContainText(
    opener,
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  const homeActiveCard = page.locator("article.feed-post-active[data-post-id]");
  await expect(homeActiveCard).toHaveCount(1);
  await expect(homeActiveCard.locator("button.feed-reaction")).toHaveCount(3);
  const nextFeed = await page.request.get("/api/feed");
  expect(nextFeed.ok()).toBeTruthy();
  const feed = (await nextFeed.json()) as FeedResponse;
  expect(feed.reactionCount).toBe(15);
  for (const meme of feed.memes) {
    expect(reactedIds.has(meme.id)).toBe(false);
    expectOfficialXPost(meme);
  }

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel(/^Date of birth/)).toHaveValue("1999-04-12");
  await expect(page.getByLabel(/^Town/)).toHaveValue("Albany");
  await expect(
    page.getByRole("textbox", { name: "Bio", exact: true }),
  ).toHaveValue("I collect terrible work memes and excellent tiny snacks.");
  await page.getByRole("button", { name: "Back to me", exact: true }).click();

  const firstReacted = [...reactedSources.entries()][0];
  if (!firstReacted) throw new Error("No reacted source was retained.");
  const [deepLinkId, deepLinkSource] = firstReacted;
  const deepLinkResponse = await page.request.get(
    `/api/posts/${encodeURIComponent(deepLinkId)}`,
  );
  expect(deepLinkResponse.ok()).toBeTruthy();
  const deepLinkData = (await deepLinkResponse.json()) as { meme: Meme };
  const deepLinkMeme = expectOfficialXPost(deepLinkData.meme);
  expect(deepLinkMeme.xPost).toEqual(deepLinkSource);
  await page.goto(
    `/?view=memes&post=${encodeURIComponent(deepLinkId)}`,
  );
  const deepCard = page.locator("article.feed-post-active[data-post-id]");
  await expect(deepCard).toHaveCount(1);
  await expect(deepCard).toHaveAttribute("data-post-id", deepLinkId);
  await expect(deepCard.locator(".x-embed-heading strong")).toHaveText(
    deepLinkSource.author,
  );
  const fallback = deepCard.locator('.x-embed-fallback[role="alert"]');
  await expect(fallback).toBeVisible({ timeout: 15_000 });
  await expect(
    deepCard.getByRole("link", { name: "Open original on X", exact: true }),
  ).toHaveAttribute("href", deepLinkSource.url);
});

test("all product surfaces fit required widths", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await signInFreshDemo(page, baseURL!);
  await completeProfile(page);
  const destinations = [
    { view: "memes", heading: null },
    { view: "matches", heading: null },
    { view: "post", heading: "Share a meme." },
    { view: "notifications", heading: "Notifications." },
    { view: "saved", heading: "Saved posts" },
    { view: "chats", heading: "The conversation." },
    { view: "me", heading: "Your profile" },
    { view: "admin", heading: "The meme studio." },
  ];
  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { view, heading } of destinations) {
      await page.goto(`/?view=${view}`);
      if (view === "memes") {
        await expect(page.locator(".meme-feed")).toBeVisible();
        await expect(
          page.locator(
            "article.feed-post-active[data-post-id] button.feed-reaction",
          ),
        ).toHaveCount(3);
        await expect(
          page.locator(
            "article.feed-post-active[data-post-id] button.feed-reaction.like",
          ),
        ).toBeEnabled();
      } else if (view === "matches") {
        await expect(page.locator(".discover-feed")).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: heading!, exact: true }),
        ).toBeVisible();
      }
      await expect(page.getByRole("navigation")).toBeVisible();
      await expectNoOverflow(page);
    }
  }
});
