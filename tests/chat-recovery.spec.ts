import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { ChatMessage } from "../lib/contracts";

const demoPassword = "Memeant-demo-2026!";
const matchId = "demo-match-sam-taylor";
const messagesPath = `/api/matches/${matchId}/messages`;
const messagesRoute = `**${messagesPath}*`;

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

async function openFreshConversation(page: Page, baseURL: string) {
  // Reset only before the test; all subsequent chat reads and writes use real member sessions.
  const headers = { Origin: new URL(baseURL).origin };
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email: "alex@demo.local", password: demoPassword },
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
  await page.getByLabel("Email", { exact: true }).fill("sam@demo.local");
  await page.getByLabel("Password", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.goto(`/?view=chats&chat=${matchId}`);
  await expect(
    page.getByRole("heading", { name: "Taylor", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeEditable();

  const response = await page.request.get(messagesPath);
  expect(response.ok(), await response.text()).toBeTruthy();
  const initial = (await response.json()) as {
    messages: ChatMessage[];
    nextCursor: string | null;
  };
  expect(initial.nextCursor).toBeNull();
  expect(initial.messages).toHaveLength(3);
  await expect(
    page
      .getByRole("log", { name: "Conversation messages" })
      .locator(".message p"),
  ).toHaveText(initial.messages.map((message) => message.body));
  return initial.messages;
}

test("a delayed real send cannot discard the next unsent composer draft", async ({
  page,
  baseURL,
}) => {
  await openFreshConversation(page, baseURL!);
  const submitted = "Send this message while its real response is delayed.";
  const nextDraft = "Keep this next draft until I choose to send it.";
  const composer = page.getByLabel("Message", { exact: true });
  const send = page.getByRole("button", { name: "Send message", exact: true });
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let stored = false;

  await page.route(messagesRoute, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBeTruthy();
    stored = true;
    await responseGate;
    await route.fulfill({ response });
  });

  try {
    await composer.fill(submitted);
    const delivered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === messagesPath &&
        response.request().method() === "POST",
    );
    await send.click();
    await expect.poll(() => stored).toBe(true);
    await expect(send).toBeDisabled();

    // Either safe contract is valid: freeze editing, or preserve edits made during the send.
    const acceptsNextDraft = await composer.isEditable();
    if (acceptsNextDraft) {
      await composer.fill(nextDraft);
      await expect(composer).toHaveValue(nextDraft);
    } else {
      await expect(composer).toBeDisabled();
      await expect(composer).toHaveValue(submitted);
    }

    releaseResponse();
    const response = await delivered;
    expect(response.ok(), await response.text()).toBeTruthy();
    await expect(
      page.getByRole("log").getByText(submitted, { exact: true }),
    ).toBeVisible();
    await expect(composer).toBeEditable();
    if (acceptsNextDraft) {
      await expect(send).toBeEnabled();
      await expect(composer).toHaveValue(nextDraft);
    } else {
      await expect(composer).toHaveValue("");
      await composer.fill(nextDraft);
    }
    await expect(composer).toHaveValue(nextDraft);
    await expect(send).toBeEnabled();

    const persisted = await page.request.get(messagesPath);
    expect(persisted.ok(), await persisted.text()).toBeTruthy();
    const { messages } = (await persisted.json()) as {
      messages: ChatMessage[];
    };
    expect(
      messages.filter((message) => message.body === submitted),
    ).toHaveLength(1);
    expect(messages.some((message) => message.body === nextDraft)).toBe(false);
    await expect(
      page.getByRole("log").getByText(nextDraft, { exact: true }),
    ).toHaveCount(0);
  } finally {
    releaseResponse();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a disjoint polling page keeps every intervening message reachable without duplicates", async ({
  page,
  request,
  baseURL,
}) => {
  let initialRead = true;
  let releasePolling!: () => void;
  const pollingGate = new Promise<void>((resolve) => {
    releasePolling = resolve;
  });
  // Let initial history load, then hold browser polling until the real burst is complete.
  // The authorized APIRequestContext writes bypass browser interception.
  await page.route(messagesRoute, async (route) => {
    if (
      route.request().method() === "GET" &&
      !new URL(route.request().url()).searchParams.has("cursor")
    ) {
      if (initialRead) initialRead = false;
      else await pollingGate;
    }
    await route.continue();
  });

  try {
    const initialMessages = await openFreshConversation(page, baseURL!);
    const earlier = page.getByRole("button", {
      name: "Load earlier messages",
      exact: true,
    });
    await expect(earlier).toHaveCount(0);
    const headers = { Origin: new URL(baseURL!).origin };
    const login = await request.post("/api/auth/sign-in/email", {
      headers,
      data: { email: "taylor@demo.local", password: demoPassword },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const bodies = Array.from(
      { length: 35 },
      (_, index) =>
        `Recovery burst message ${String(index + 1).padStart(2, "0")}`,
    );
    for (const body of bodies) {
      const sent = await request.post(messagesPath, {
        headers,
        data: { body },
      });
      expect(sent.ok(), await sent.text()).toBeTruthy();
    }

    const newest = await request.get(messagesPath);
    expect(newest.ok(), await newest.text()).toBeTruthy();
    const newestPage = (await newest.json()) as {
      messages: ChatMessage[];
      nextCursor: string | null;
    };
    expect(newestPage.nextCursor).not.toBeNull();
    expect(
      newestPage.messages.some((message) => message.body === bodies[0]),
    ).toBe(false);
    expect(
      newestPage.messages.some((message) =>
        initialMessages.some((initial) => initial.id === message.id),
      ),
    ).toBe(false);

    releasePolling();
    const thread = page.getByRole("log", { name: "Conversation messages" });
    // Wait for the actual four-second poll rather than sleeping or forcing a reload.
    await expect(
      thread.getByText(bodies.at(-1)!, { exact: true }),
    ).toBeVisible();
    await expect(thread.getByText(bodies[0], { exact: true })).toHaveCount(0);
    await expect(earlier).toBeVisible();
    await earlier.click();
    await expect(thread.getByText(bodies[0], { exact: true })).toBeVisible();
    await expect(earlier).toHaveCount(0);

    const expectedBodies = [
      ...initialMessages.map((message) => message.body),
      ...bodies,
    ];
    await expect(thread.locator(".message p")).toHaveCount(
      expectedBodies.length,
    );
    expect(
      (await thread.locator(".message p").allTextContents()).sort(),
    ).toEqual(expectedBodies.sort());
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  } finally {
    releasePolling();
    await page.unrouteAll({ behavior: "wait" });
  }
});
