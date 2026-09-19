import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type {
  ChatMessage,
  Match,
  Me,
  Meme,
  Tasteprint,
} from "../lib/contracts";

const demoEmail = "alex@demo.local";
const demoPassword = "Memeant-demo-2026!";
const startingTags = ["absurd", "cursed", "deadpan"];

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
  expect(((await before.json()) as Me).profile?.complete).toBe(false);
}

async function completeProfile(page: Page) {
  await page.getByLabel("Display name").fill("Alex");
  await page.getByLabel("Date of birth").fill("1999-04-12");
  await page.getByLabel("Broad location").fill("Brooklyn");
  await page
    .getByLabel("One thing about you")
    .fill("I collect terrible work memes and excellent tiny snacks.");
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
  await page.getByLabel("Minimum age").fill("18");
  await page.getByLabel("Maximum age").fill("45");
  await page
    .getByRole("button", { name: "Choose portrait 2", exact: true })
    .click();
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
    page.getByRole("button", { name: "LOL", exact: true }),
  ).toBeEnabled();
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

test("real reactions create explainable Jules match, an explicitly sent meme opener, and durable reset-safe media", async ({
  page,
  baseURL,
}) => {
  await signInFreshDemo(page, baseURL!);
  await completeProfile(page);
  const reactedIds = new Set<string>();
  const reactedTags = new Set<string>();
  const preservedAssets = new Map<string, string>();
  const mediaTypes = new Set<string>();

  for (let index = 0; index < 15; index += 1) {
    await expect(
      page.getByRole("button", { name: "LOL", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".meme-frame")).toHaveCount(1);
    const video = page.locator(".meme-frame video");
    const isVideo = (await video.count()) === 1;
    const media = isVideo ? video : page.locator(".meme-frame img");
    await expect(media).toBeVisible();
    if (isVideo) {
      await expect
        .poll(() =>
          video.evaluate((element) => (element as HTMLVideoElement).readyState),
        )
        .toBeGreaterThanOrEqual(2);
      expect(
        await video.evaluate((element) => (element as HTMLVideoElement).muted),
      ).toBe(true);
    } else {
      await expect
        .poll(() =>
          media.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
    }
    const kind = isVideo ? "video" : "image";
    if (!mediaTypes.has(kind)) {
      const src = await media.getAttribute("src");
      expect(src).toBeTruthy();
      const asset = await page.request.get(src!);
      expect(asset.ok()).toBeTruthy();
      expect(asset.headers()["content-type"]).toContain(
        isVideo ? "video/" : "image/",
      );
      preservedAssets.set(
        src!,
        createHash("sha256")
          .update(await asset.body())
          .digest("hex"),
      );
    }
    mediaTypes.add(kind);
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/reactions" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "LOL", exact: true }).click();
    const response = await saved;
    expect(response.ok(), await response.text()).toBeTruthy();
    const reaction = (await response.json()) as {
      tags: string[];
      reactionCount: number;
    };
    const { memeId } = response.request().postDataJSON() as { memeId: string };
    expect(reactedIds.has(memeId)).toBe(false);
    reactedIds.add(memeId);
    for (const tag of reaction.tags) reactedTags.add(tag);
    expect(reaction.reactionCount).toBe(index + 1);
    await expect(
      page.getByText("Last meme’s ingredients", { exact: true }),
    ).toBeVisible();
  }
  expect([...mediaTypes].sort()).toEqual(["image", "video"]);

  await page
    .getByRole("button", { name: "Open your tasteprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your tasteprint.", exact: true }),
  ).toBeVisible();
  const tasteResponse = await page.request.get("/api/tasteprint");
  expect(tasteResponse.ok()).toBeTruthy();
  const taste = (await tasteResponse.json()) as Tasteprint;
  expect(taste.reactionCount).toBe(15);
  expect(taste.positiveCount).toBe(15);
  expect(taste.calibrated).toBe(true);
  for (const item of taste.tags) expect(reactedTags.has(item.tag)).toBe(true);
  await expect(page.locator(".taste-row h3")).toHaveText(
    taste.tags.slice(0, 3).map((item) => item.tag),
  );
  await expect(
    page.getByRole("heading", { name: taste.summary, exact: true }),
  ).toBeVisible();
  if (taste.tags.length > 3) {
    await page
      .getByRole("button", { name: "Show all tags", exact: true })
      .click();
    await expect(page.locator(".settings-section .tags span")).toHaveText(
      taste.tags.slice(3).map((item) => item.tag),
    );
  }

  await page
    .getByRole("button", { name: "Find my people", exact: true })
    .click();
  await expect(
    page.locator("article.candidate").getByRole("heading", { name: /^Jules,/ }),
  ).toBeVisible();
  const matched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/profile-decisions" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Like", exact: true }).click();
  const matchResponse = await matched;
  expect(matchResponse.ok()).toBeTruthy();
  const { match } = (await matchResponse.json()) as { match: Match };
  expect(match.profile.name).toBe("Jules");
  expect(match.compatibility.sharedMemes[0]).toBeDefined();
  const reveal = page.getByRole("dialog", {
    name: "It’s mutual.",
    exact: true,
  });
  await expect(reveal).toBeVisible();
  await expect(
    reveal.getByRole("heading", { name: "Same damage. Mutual interest." }),
  ).toBeVisible();
  await expect(
    reveal.getByRole("img", { name: "Alex", exact: true }),
  ).toBeVisible();
  await expect(
    reveal.getByRole("img", { name: "Jules", exact: true }),
  ).toBeVisible();
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
    page.getByRole("heading", { name: "Jules", exact: true }),
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
  await page
    .getByRole("button", { name: /Explain why this destroyed both of us/ })
    .click();
  const opener = "Explain why this destroyed both of us.";
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(opener);
  const unsent = await page.request.get(messagesPath);
  expect(unsent.ok()).toBeTruthy();
  expect(
    ((await unsent.json()) as { messages: ChatMessage[] }).messages,
  ).toEqual([]);
  expect(automaticSends).toBe(0);
  await expect(page.getByLabel("Reference our shared meme")).toBeChecked();
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
  expect(message.memeId).toBe(match.compatibility.sharedMemes[0].id);
  await expect(
    page.locator(".message").getByText(opener, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".message")
      .getByText("About your shared meme", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`chat=${match.id}`));
  await expect(
    page.locator(".message").getByText(opener, { exact: true }),
  ).toBeVisible();
  const persisted = await page.request.get(messagesPath);
  expect(
    ((await persisted.json()) as { messages: ChatMessage[] }).messages,
  ).toEqual([message]);
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
    .getByRole("button", { name: "Memes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "15 reactions", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "15 reactions", exact: true }),
  ).toBeVisible();
  const nextFeed = await page.request.get("/api/feed");
  const feed = (await nextFeed.json()) as {
    memes: Meme[];
    reactionCount: number;
  };
  expect(feed.reactionCount).toBe(15);
  for (const meme of feed.memes) expect(reactedIds.has(meme.id)).toBe(false);

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Me", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Date of birth")).toHaveValue("1999-04-12");
  await expect(page.getByLabel("Broad location")).toHaveValue("Brooklyn");
  await expect(page.getByLabel("One thing about you")).toHaveValue(
    "I collect terrible work memes and excellent tiny snacks.",
  );
  await expect(
    page
      .getByRole("group", { name: "Three starting humor tags", exact: true })
      .getByRole("button", { pressed: true }),
  ).toHaveText(startingTags);
  await page.getByRole("button", { name: "Back to me", exact: true }).click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  const resetDialog = page.getByRole("dialog", {
    name: "Reset the demo?",
    exact: true,
  });
  await resetDialog
    .getByRole("button", { name: "Reset demo", exact: true })
    .click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  const restoredProfile = await page.request.get("/api/profile");
  expect(restoredProfile.ok()).toBeTruthy();
  expect(((await restoredProfile.json()) as Me).profile?.complete).toBe(false);
  // Reset restores onboarding; finish the adult gate before reading protected taste/match APIs.
  await completeProfile(page);
  const restoredTaste = await page.request.get("/api/tasteprint");
  expect(await restoredTaste.json()).toMatchObject({
    reactionCount: 0,
    positiveCount: 0,
    calibrated: false,
    tags: [],
  });
  const restoredMatches = await page.request.get("/api/matches");
  expect(
    ((await restoredMatches.json()) as { matches: Match[] }).matches,
  ).toEqual([]);
  for (const [src, hash] of preservedAssets) {
    const asset = await page.request.get(src);
    expect(asset.ok()).toBeTruthy();
    expect(
      createHash("sha256")
        .update(await asset.body())
        .digest("hex"),
    ).toBe(hash);
  }
});

test("all product surfaces fit required widths and reset dialog keeps and restores keyboard focus", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await signInFreshDemo(page, baseURL!);
  await completeProfile(page);
  const destinations = [
    { view: "memes", heading: "Funny to you?" },
    { view: "taste", heading: "Your tasteprint." },
    { view: "matches", heading: "Your kind of weird." },
    { view: "chats", heading: "The conversation." },
    { view: "me", heading: "Me, unfortunately." },
    { view: "admin", heading: "The meme studio." },
  ];
  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { view, heading } of destinations) {
      await page.goto(`/?view=${view}`);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("navigation")).toBeVisible();
      if (view === "memes")
        await expect(
          page.getByRole("button", { name: "LOL", exact: true }),
        ).toBeEnabled();
      if (view === "matches")
        await expect(page.locator("article.candidate")).toBeVisible();
      await expectNoOverflow(page);
    }
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Me", exact: true })
      .click();
    const resetButton = page.getByRole("button", {
      name: "Reset demo",
      exact: true,
    });
    await resetButton.click();
    const dialog = page.getByRole("dialog", {
      name: "Reset the demo?",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(resetButton).toBeFocused();
    await expectNoOverflow(page);
  }
  // This test does not submit studio jobs: an E2E run must never spend provider credits.
});
