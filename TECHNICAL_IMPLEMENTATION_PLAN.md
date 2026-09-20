# Crackd: Technical Implementation Plan

## 1. Goal

Build a localhost-first, mobile-friendly dating prototype that creates compatibility scores from the tags of official X posts and optional locally generated memes users explicitly like.

The prototype must support this complete flow:

1. A user creates a basic dating profile.
2. The user reacts explicitly to official X posts and, when available, locally generated image or video memes.
3. The app builds an explainable meme taste profile.
4. The app ranks compatible people.
5. An eligible profile like creates an immediate match, and matched users can exchange basic chat messages.

The matching logic should be easy to explain, deterministic, and credible in a hackathon pitch. It should not require model training, embeddings, or a vector database.

## 2. Scope

### MVP requirements

- Mobile-first web application that also works on desktop.
- Local development with one application process and one SQLite database.
- Optional server-side xAI image and video generation through the manual media studio.
- Persistent local copies of manually generated media.
- Controlled meme tag taxonomy.
- Like, pass, and strong-like reactions.
- Explainable compatibility scores.
- Profile discovery, immediate profile matching, and basic chat.
- Seeded users and reaction histories for a deterministic demo.
- A reset mechanism that restores the demo state.

### Explicitly out of scope

- Native iOS or Android applications.
- Realtime WebSocket infrastructure.
- Push notifications.
- Precise location tracking or maps.
- Payments and subscriptions.
- Production-scale media storage.
- Learned recommendation models.
- Embedding or vector databases.
- Video calls.
- Live meme generation in the normal feed.
- A production moderation or identity-verification system.

## 3. Architecture

Use a single Next.js application for the UI, server routes, authentication, matching logic, and media access.

### Recommended stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Application | Next.js App Router with TypeScript | One project for UI and server routes |
| Styling | Tailwind CSS v4 | Fast mobile-first styling |
| Motion | Motion for React | Small interaction and match animations |
| Database | SQLite | Zero-service localhost setup |
| ORM | Drizzle ORM | Lightweight typed queries and migrations |
| Authentication | Better Auth | Local email/password sessions without an external service |
| Validation | Zod | Shared validation at API boundaries |
| Media storage | Local `data/media` directory | Avoids cloud storage during the hackathon |
| External media API | xAI Imagine API | Optional manual image and video generation |
| E2E verification | Playwright | Covers the critical mobile user flow |

### Runtime topology

- The browser talks only to the Next.js application.
- The Next.js server owns the optional xAI API key.
- Server routes read and write SQLite through Drizzle.
- Official X rows retain source metadata and are rendered through the external X widget when available.
- Manually generated files are downloaded to local storage and served through a controlled media route.
- No browser request communicates directly with xAI.

## 4. Repository Structure

Use clear feature boundaries without creating unnecessary layers.

| Area | Responsibility |
| --- | --- |
| `app` | Pages, layouts, route handlers, and server actions |
| `components` | Shared product UI components |
| `features/auth` | Session and profile setup behavior |
| `features/memes` | Feed, reactions, generation, and media handling |
| `features/matching` | Taste vectors, compatibility scores, and explanations |
| `features/matches` | Profile decisions, immediate match creation, and chat entry |
| `features/chat` | Match-gated messages |
| `db` | Schema, migrations, queries, and deterministic seed data |
| `lib/xai` | Server-only xAI client and response mapping |
| `lib/media` | Safe download, persistence, and file lookup |
| `data/media` | Runtime-generated local assets, excluded from source control |

Do not add repository, service, and controller layers unless the implementation becomes difficult to follow without them.

## 5. Configuration

Environment values:

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | Optional server-only xAI authorization for manual Studio generation |
| `DATABASE_URL` | SQLite database location |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `APP_BASE_URL` | Local application origin |
| `DEMO_MODE` | Enables seeded personas and demo reset controls |
| `MEDIA_DIR` | Optional local directory for generated media; defaults to `./data/media` |

The official X feed and deterministic demo seed do not require `XAI_API_KEY`. The application must fail clearly at the generation route when a funded key or model access is absent. Never expose `XAI_API_KEY` in browser code, serialized page data, or client logs.

## 6. Data Model

### `users`

Stores account and dating profile data.

- ID
- Email and password identity fields managed by the auth library
- Display name
- Date of birth rather than a stored age
- Bio
- Photo paths
- Dating intent
- Private preference data
- Profile completeness state
- Creation and update timestamps

### `memes`

Stores either an official X source row or optional locally generated media and its provider state.

- ID
- Media type: `x`, image, or video
- Prompt and caption
- Controlled tags and tag weights as JSON
- Chaos level from 1 to 5
- Taxonomy version
- Nullable local asset path
- Nullable poster image path
- Nullable `xPost` JSON for official source ID, URL, author, and source media type
- Status: queued, generating, ready, failed, or expired
- Provider model
- Provider request ID for asynchronous video jobs
- Failure reason safe for internal display
- Creation and completion timestamps

Official X rows use `type = x`, `model = official-x`, `status = ready`, and no local asset or poster. They remain renderable from source metadata even when the external widget cannot load.

### `reactions`

Stores one current reaction per user and meme.

- User ID
- Meme ID
- Reaction: like, pass, or strong-like
- Creation and update timestamps
- Unique constraint on user ID plus meme ID

An update replaces the prior reaction rather than creating duplicates.

### `profile_decisions`

Stores a user's decision about another person.

- Actor user ID
- Target user ID
- Decision: like or pass
- Creation timestamp
- Unique constraint on actor plus target

### `matches`

Stores active profile matches.

- ID
- Canonically ordered user A and user B IDs
- Compatibility score at creation
- Score component data and explanation as JSON
- Creation timestamp
- Optional unmatched timestamp
- Unique constraint on the canonical user pair

### `messages`

Stores basic match-gated chat messages.

- ID
- Match ID
- Sender user ID
- Body
- Optional shared meme ID
- Creation timestamp

Only members of an active match may read or create its messages.

## 7. Meme Taxonomy

Do not let the optional Studio model invent arbitrary labels. Select tags before generation, then build the prompt from those tags. Official X rows use their approved source category as a topic tag, so the same vocabulary remains available for matching.

### Current taxonomy, version 3

| Dimension | Values |
| --- | --- |
| Tone | absurd, wholesome, cursed, deadpan, dark, cringe |
| Format | reaction, POV, fake screenshot, starter pack, deep-fried |
| Topic | political, political-shitposts, brainrot, italian-brainrot, skibidi-toilet, larping, gooning, dating, developer-humor, cats, doomscrolling, corporate-core, corecore, rage-bait, sigma-grindset, medieval, niche-jobs, phonk |
| Chaos | integer from 1 through 5 |

The approved official source archive contains 239 X posts. Every row retains its source category, canonical URL, author, caption, numeric status ID, and source media type; the archive also keeps provenance metadata for the collection. Source media types may identify image, video, mixed, or text content and do not imply a local asset.

Optional locally generated memes should have:

- One tone tag.
- One format tag.
- One or two topic tags.
- One chaos value.
- Three to five total categorical tags.

Store a taxonomy version on every meme. Changes to the vocabulary should create a new version rather than silently changing the meaning of old data.

## 8. xAI Generation Pipeline

### Image generation

- Use `grok-imagine-image-2.0`.
- Request a vertical aspect ratio suitable for mobile.
- Treat the returned URL as temporary.
- Download the image immediately after a successful response.
- Validate the response content type and enforce a file-size ceiling before persistence.
- Mark the meme ready only after the local file is durable.

### Video generation

- Use `grok-imagine-video-1.5`.
- Prefer 5 to 8 second clips at 480p or 720p.
- Start the provider request and persist its request ID.
- Return the local job immediately with a generating status.
- Let the browser poll an internal job-status endpoint.
- On each poll, the server checks xAI when the local job is incomplete.
- When xAI reports completion, download the temporary file before marking the meme ready.
- Handle pending, done, failed, and expired states explicitly.
- Do not use an unbounded background loop or retry policy.

### Seed and generation strategy

The normal feed is seeded from `db/x-posts.json`, not from generated assets:

- `db:seed` synchronizes the 239 approved official X rows and resets the fictional demo state.
- Seeding makes no xAI requests, does not require `XAI_API_KEY`, and does not create local image or video assets.
- The active card may load the X widget when the browser has internet access and the post remains embeddable.
- A blocked, deleted, or unavailable post keeps its stored caption and source link, with a retry action where appropriate.
- The app can deep-link to an official row with `/?view=memes&post=x-<status-id>` and also exposes the original `xPost.url`.

Manual generation remains optional. **Profile → Open media studio** starts one deliberate paid image or six-second video job using the controlled taxonomy. Provider URLs are temporary, so completed media is downloaded and marked ready only after the local file is durable. Pending, done, failed, and expired states remain explicit, and the browser uses bounded polling rather than an unbounded worker.

### Safety and reliability

- Keep all generation controls behind an authenticated development-only or admin-only surface.
- Use an idempotency token so a double click cannot start duplicate paid jobs.
- Limit concurrent generation requests.
- Store a human-readable failure state without leaking provider credentials.
- Do not automatically retry moderation failures.
- Provide a source-metadata fallback when an official feed item becomes unavailable.

Official references:

- [xAI image generation](https://docs.x.ai/developers/model-capabilities/images/generation)
- [xAI video generation](https://docs.x.ai/developers/model-capabilities/video/generation)
- [xAI pricing](https://docs.x.ai/developers/pricing)

## 9. Server API Surface

Use JSON route handlers for interactive client operations. Auth routes remain owned by the authentication library.

| Method and route | Responsibility |
| --- | --- |
| `GET /api/feed` | Return the next ready memes using cursor pagination |
| `POST /api/reactions` | Create or replace one meme reaction |
| `GET /api/tasteprint` | Return derived tag weights and explanation data |
| `GET /api/candidates` | Return preference-filtered compatible profiles |
| `POST /api/profile-decisions` | Store a profile decision and create an immediate match for an eligible like |
| `GET /api/matches` | List active matches for the current user |
| `GET /api/matches/:id/messages` | Return messages for an authorized match member |
| `POST /api/matches/:id/messages` | Create a message for an authorized match member |
| `GET /api/media/:id` | Stream an authorized local media asset |
| `POST /api/admin/generations/images` | Start an image generation request |
| `POST /api/admin/generations/videos` | Start a video generation request |
| `GET /api/admin/generations/:id` | Poll local and provider generation status |
| `POST /api/admin/demo-reset` | Restore deterministic demo state when demo mode is enabled |

Every write route must validate its payload, require a session, and return a stable error shape. Pagination, not an unbounded list, should be used for feed and message reads.

## 10. Feed Selection

The feed should optimize for tag coverage rather than personalization during the first session.

### Calibration phase

For the first 15 reactions:

- Avoid showing the same topic repeatedly.
- Mix tones, formats, and chaos levels.
- Mix images with occasional videos.
- Exclude already-reacted memes.
- Do not reveal tags before the reaction.

### Continuing feed

After calibration:

- Continue serving unseen memes.
- Slightly increase content near the user's preferred tags.
- Keep at least 30 percent of results exploratory so the taste profile can change.
- Do not build a learned ranking system for the MVP.

## 11. Compatibility Algorithm

Present the feature as the **Latent LOL Compatibility Engine**. Internally it is a tag-weighted similarity calculation.

### Eligibility filtering

Before scoring, remove candidates who:

- Do not satisfy both users' private dating preferences.
- Are the current user.
- Were already passed.
- Are already matched.
- Are blocked or unavailable.

Exact distance should not be part of the prototype.

### Taste vector

For each user and tag:

1. Sum positive reactions on memes containing the tag.
2. Give a normal like weight 1.
3. Give a strong-like weight 2.
4. Give passes no positive weight.
5. Multiply by the meme's tag weight.
6. Apply inverse user frequency so universally liked tags contribute less than rare shared tags.
7. Normalize the final user vector.

A suitable inverse-frequency factor is:

$$
\log\left(\frac{U+1}{U_t+1}\right)
$$

Where $U$ is the number of users with enough reactions and $U_t$ is the number of those users who liked tag $t$.

### Compatibility score

Combine two explainable values:

- 80 percent cosine similarity between normalized weighted tag vectors.
- 20 percent Jaccard overlap between each user's highest-weight tags.

Return a score from 0 through 100.

Do not calculate a score until both users have at least 10 positive reactions. Before that threshold, return curated or shuffled candidates with a clear calibration state rather than a fabricated percentage.

### Explanation

For each candidate, return:

- The three shared tags with the highest contribution.
- Up to two memes both users liked.
- A short generated-from-data sentence such as, “You both over-index on cursed pets and corporate absurdism.”

Do not call the score scientific, predictive, or a guarantee of relationship success.

### Computation strategy

Calculate candidates on request for the prototype. The dataset is small enough that loading user vectors and scoring eligible seeded users is simpler than maintaining a cache. Add precomputation only if measured latency requires it.

## 12. Profile Match Creation

Compatibility ranking identifies eligible profiles, but a profile match does not require a reciprocal decision.

1. The user likes an eligible profile.
2. The server stores the decision once and creates one canonical match inside a transaction.
3. The server persists the current compatibility explanation with the match.
4. The server returns a match-created response so the UI can show the reveal and open the real chat.

A repeated request returns the existing match rather than creating a duplicate. A passed, blocked, unavailable, or otherwise ineligible profile cannot create a match.

## 13. Chat

Keep chat deliberately basic:

- Match members only.
- Text messages only.
- Optional reference to one shared meme.
- Poll for new messages when the conversation is open.
- Order messages by creation time and ID.
- No typing indicators, read receipts, attachments, reactions, or realtime transport.

The initial composer should show a shared meme and a suggested opener. The suggestion is UI copy, not an automatic message.

## 14. Authentication and Safety

For the hackathon:

- Seed 30 clearly fictional adult personas with deterministic state.
- Store date of birth and enforce an 18+ gate.
- Keep dating preferences private.
- Do not expose exact location.
- Include block and report entry points if any non-team users can interact.
- Escape and validate all user-created text.
- Authorize every profile, match, message, generation, and media operation server-side.
- Keep optional Studio prompts and content within xAI usage rules.

The project must be presented as a prototype, not a production-ready dating service.

## 15. Seed and Demo Data

Create deterministic seed data for:

- The 239 approved official X posts in `db/x-posts.json`, with source URL, author, caption, media type, and collection provenance.
- 30 fictional adult personas with multiple preference combinations.
- Deterministic reaction histories for the 29 non-Alex personas, based on the official X rows.
- Several intentionally high-compatibility pairs and several low-compatibility pairs.
- An intentionally eligible profile for the direct-like walkthrough; no reciprocal decision is required.
- A small existing chat for visual verification.

Alex is the fresh demo user. Alex starts without a tasteprint, with an incomplete profile, and with an empty photo list. The first 15 official posts are ordered for coverage within the larger 239-post archive; only explicit reaction buttons persist choices and change `reactionCount`. Scrolling, wheel input, iframe focus, and active-card changes are neutral.

`db:seed` synchronizes official rows, resets fictional profiles and their reactions, decisions, matches, and messages, and preserves sessions plus unrelated local user content and local uploads. Migration 5 stores official X metadata with nullable local assets. Reseeding prunes obsolete named seed rows while preserving unrelated local rows and their dependents. It intentionally resets fictional persona progress; use it to restore the start of the pitch demo, not to preserve a run in progress.

## 16. Delivery Phases

### Phase 1: Foundation

- Initialize Next.js, TypeScript, styling, and local configuration.
- Add Drizzle schema and migrations.
- Add authentication and profile setup.
- Add deterministic seed and reset behavior.

Acceptance: two seeded users can sign in locally and retain sessions.

### Phase 2: Official feed and optional media

- Import and synchronize the official X source file without downloading or generating feed media.
- Render the active source through the X widget when external availability permits.
- Keep caption, author, source URL, and retry fallback when a post is blocked, deleted, or the widget is unavailable.
- Retain manual Studio generation, local persistence, and explicit paid-job state handling as optional functionality.

Acceptance: the 239 official rows remain usable with or without internet access, through an iframe or an honest source fallback, and optional generated media remains local after provider URLs expire.

### Phase 3: Reaction loop

- Build cursor-based feed retrieval.
- Persist only explicit, idempotent reactions.
- Keep scrolling and active-card changes neutral, including iframe wheel scrolling.
- Implement calibration coverage over official source rows.
- Expose tasteprint data after the minimum threshold.

Acceptance: neutral scrolling leaves `reactionCount` unchanged, while explicit reactions advance the feed, update the tasteprint, and never duplicate.

### Phase 4: Matching

- Implement preference filtering.
- Implement weighted vectors and compatibility scores.
- Return contribution-based explanations.
- Build profile decisions and transactional immediate matching.

Acceptance: seeded high-overlap users rank above low-overlap users, and an eligible profile like creates exactly one match without a reciprocal like.

### Phase 5: Chat and demo polish

- Add match-gated messages.
- Add the shared-meme opener.
- Complete loading, empty, failure, and reset states.
- Verify the mobile flow and prepare the official-feed walkthrough.

Acceptance: a user can complete the entire demo without manual database changes.

## 17. Verification

### End-to-end scenario

Run the actual application at a mobile viewport and verify:

1. Sign in as the fresh demo user; upload 1–6 valid JPG/PNG/WebP photos, keep Baltimore, MD and the default nearby-demo preferences, and complete the adult profile gate.
2. Scroll through the first official X post and confirm the active ID changes without a reaction request or a `reactionCount` change.
3. Confirm that no more than five warmed X card embeds are mounted (previous, active, and next three). Leaving a local video card with the keyboard removes its video iframe.
4. Click explicit **Like** or **Strong like** on five distinct official posts and confirm that only each new successful positive changes the count, tasteprint, and feed advance; confirm the one-time suggestion popup appears on the fifth.
5. Confirm that the positive-reaction counter survives in-app navigation but resets on a full reload or new app open, and that replacing or repeating a reaction does not increment it.
6. With internet access, exercise an image post, a video post, and a text-only post and confirm embeddable rows render through the X widget when available. Without external access, confirm the stored caption, honest fallback, Retry action when useful, and original source link remain usable.
7. Open a shared deep link such as `/?view=memes&post=x-<status-id>` and confirm the post loads or falls back to the feed without losing the source URL.
8. Open Discover, like the intended eligible profile, and confirm that the real match is created immediately without a reciprocal decision.
9. Open the real chat, explicitly send a message tied to a shared meme, reload, and confirm the state persists.
10. Reset the demo and confirm fictional state returns while sessions and unrelated local content remain.

### Focused automated coverage

Keep permanent tests only for behavior that is easy to regress:

- Official seed synchronization: 239 rows, preserved source provenance, and preservation of unrelated local rows and dependents.
- Migration 5 support for `type = x`, nullable local assets, and foreign-key dependents.
- Reaction uniqueness and replacement.
- Compatibility ordering for a fixed dataset.
- Cold-start behavior below the reaction threshold.
- Preference filtering before scoring.
- Idempotent immediate-match creation for an eligible profile like.
- Message authorization.
- Video job state mapping for done, failed, and expired responses.

Use bounded commands rather than the package-wide test scripts. These commands are verification instructions only and do not claim a final pass:

```sh
npx tsx --test tests/x-post-seeds.test.ts tests/core.test.ts tests/video.test.ts
# With the app already running and a disposable demo database:
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e.spec.ts -g "real reactions create an explainable match"
```

### External integration smoke checks

When a funded `XAI_API_KEY` and model access are intentionally available, use the Studio UI to:

- Generate and persist one real image.
- Generate, poll, and persist one real short video.
- Confirm the application still serves both files after the temporary URLs are no longer used.

These paid checks are separate from the official X feed and are not required for local seeding or the normal demo.

## 18. Main Risks

| Risk | Mitigation |
| --- | --- |
| Temporary xAI URLs | Download every successful asset immediately |
| Video latency | Keep Studio jobs asynchronous and bounded; the official feed does not wait on xAI |
| Duplicate paid requests | Idempotency tokens and disabled in-progress controls |
| Provider failure or expiration | Explicit job states and honest source fallback |
| Weak matching signal | Require calibration and use a controlled tag vocabulary |
| Fake-looking compatibility | Show shared tags and memes instead of only a percentage |
| Empty demo population | Seed 30 fictional adult personas and deterministic official-post reactions |
| Secret leakage | Keep all xAI operations server-only |
| Unsafe generated content | Review each optional Studio asset before presentation |
| Local media growth | Set file-size limits and provide a development cleanup command |

## 19. Definition of Done

The MVP is complete when:

- A clean checkout can run locally with documented environment variables and no xAI key.
- The database can be migrated and seeded deterministically with 239 official X rows and 30 fictional adult personas.
- Official source metadata and deep links remain available without local media files.
- Optional generated media is locally persistent after provider URLs expire.
- A fresh user can build a tasteprint through explicit reactions.
- Candidate order is produced by the documented matching algorithm.
- Compatibility explanations match stored reaction data.
- An eligible profile like creates one match without reciprocal gating.
- Matched users can exchange persistent messages.
- The full flow works at a mobile viewport and in the centered desktop presentation.
- The demo can be reset without regenerating paid media or deleting unrelated local uploads.

## 20. Local Setup and Manual Provisioning

This section describes the implemented local prototype, not a managed deployment service. Run commands from the repository root. The official X feed and ordinary demo never require an xAI key. Manual Studio generation is optional, paid, and external.

### Prerequisites and environment

- Use Node.js 22.12 or newer (Node.js 24 LTS recommended) and npm. A native `better-sqlite3` installation may require Python 3, `make`, and a C++ compiler if a prebuilt binary is unavailable.
- No media encoder, image generator, or external media provisioning step is required for the official feed.
- Keep the application and SQLite database on one machine for this prototype. The runtime account must be able to write the database directory and its SQLite WAL/SHM files. Optional Studio generation also needs a writable media directory.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy the random output into `BETTER_AUTH_SECRET` in `.env`; do not retain the example placeholder or commit `.env`. Keep the secret stable between restarts so sessions remain valid. The server requires at least 32 characters.

For the localhost demo, use:

```dotenv
DATABASE_URL=file:./data/memeant.db
APP_BASE_URL=http://localhost:3000
DEMO_MODE=true
# Set BETTER_AUTH_SECRET to the random value generated above.
# XAI_API_KEY is optional and can remain empty for the official X feed.
```

`APP_BASE_URL` must be the exact origin used in the browser: `localhost` and `127.0.0.1` are not interchangeable for cookies and write-origin checks. Use HTTPS and the actual trusted origin for a hosted instance; do not send sessions or credentials over a public HTTP connection. Never use a `NEXT_PUBLIC_` variable for secrets. `DATABASE_URL` is a local SQLite filename with an optional `file:` prefix, not a hosted SQL connection string. `MEDIA_DIR` optionally overrides the default `./data/media`.

For persistence outside localhost, configure absolute paths on a writable persistent volume, for example `DATABASE_URL=file:/srv/memeant/memeant.db` and `MEDIA_DIR=/srv/memeant/media`. Back up the database and referenced media together. Ephemeral/serverless filesystems, multiple application replicas, and shared-network SQLite storage are not supported by this prototype.

If using a reverse proxy, overwrite client-supplied forwarding/IP headers at that trusted boundary; authentication rate limiting must not trust arbitrary public `X-Forwarded-For` values. Keep direct access to the application port private.

### Migrate, seed the official feed, and run

```sh
# Keep the pitch run isolated from any configured local database.
export DATABASE_URL=file:./data/pitch-demo.db
export APP_BASE_URL=http://localhost:3000
export DEMO_MODE=true
npm run db:migrate
npm run db:seed
npm run dev
```
Open `http://localhost:3000` after confirming port 3000 is free. The exported `DATABASE_URL` creates a fresh pitch-only SQLite file; the existing `.env` still supplies `BETTER_AUTH_SECRET`. `db:migrate` applies the idempotent local migration runner. `db:seed` imports the 239 approved official X posts and creates or resets 30 fictional adult personas. It makes no provider calls and does not require `XAI_API_KEY`. If another port is required, change `APP_BASE_URL` and start the app on the matching port.

The archive contains 239 approved official posts. Each row stores the original status ID, canonical source URL, author, caption text, and source media type, while the archive-level source record preserves collection provenance. Official rows have no local asset or poster path, so the feed can render an X widget when the browser has internet access and the post is still available. If X blocks, deletes, rate-limits, or fails to embed a post, the app keeps the stored text and source link and shows an honest fallback; a retry is useful only when the source may become available again.

The seed synchronizer prunes obsolete named seed rows from older library versions, while preserving unrelated user-owned local uploads, manually generated media, and their database dependents. Resetting fictional state preserves sessions and local media files. Do not treat `db:seed` as a way to preserve current fictional demo progress: it intentionally resets fictional persona progress.

This 239-post expansion is checked into `db/x-posts.json` with its raw discovery/provenance record; ordinary pitch startup does not rerun paid collection or archive sync. For reproduction or audit, the bounded discovery and non-destructive validation commands are:

```sh
npm run x-posts:discover -- --target 200 --max-calls 40 --batch-size 10 --parallel 2 --output db/x-post-discovery.json
npm run x-posts:sync -- --input db/x-post-discovery.json --dry-run
```

This expansion deliberately appends the original 39-post archive with 200 new citation-verified posts and rejects status IDs already in the archive. Omit `--dry-run` only after reviewing provenance and candidates, then run `npm run x-posts:seed` to import official rows without resetting fictional profiles or reactions. Further expansion requires updating the expected archive count and category quotas before discovery. Use `npm run db:seed` only when intentionally restoring the full fictional demo state; it resets fictional persona progress. These discovery and sync commands are not needed for the 239-post pitch demo.

For a production-mode local run:

```sh
npm run build
npm run start
```

`npm run dev` and `npm run start` bind to `0.0.0.0`; apply host/firewall restrictions if this machine is on an untrusted network. Run only one server on port 3000.

### Fictional accounts and repeatable walkthrough

Every demo account uses the password `Memeant-demo-2026!`. The 30 fictional adult fixture addresses are:

| Persona | Demo email |
| --- | --- |
| Alex, fresh start | `alex@demo.local` |
| Jules | `jules@demo.local` |
| Sam | `sam@demo.local` |
| River | `river@demo.local` |
| Morgan | `morgan@demo.local` |
| Casey | `casey@demo.local` |
| Taylor | `taylor@demo.local` |
| Robin | `robin@demo.local` |
| Avery | `avery@demo.local` |
| Quinn | `quinn@demo.local` |
| Jamie | `jamie@demo.local` |
| Drew | `drew@demo.local` |
| Reese | `reese@demo.local` |
| Blair | `blair@demo.local` |
| Devon | `devon@demo.local` |
| Sky | `sky@demo.local` |
| Rowan | `rowan@demo.local` |
| Ellis | `ellis@demo.local` |
| Harper | `harper@demo.local` |
| Micah | `micah@demo.local` |
| Sloane | `sloane@demo.local` |
| Cameron | `cameron@demo.local` |
| Parker | `parker@demo.local` |
| Jordan | `jordan@demo.local` |
| Riley | `riley@demo.local` |
| Theo | `theo@demo.local` |
| Nia | `nia@demo.local` |
| Wren | `wren@demo.local` |
| Leo | `leo@demo.local` |
| Mina | `mina@demo.local` |

For tomorrow's pitch demo, use this order:

1. Sign in as Alex with `alex@demo.local` and password `Memeant-demo-2026!`. In onboarding, upload one real JPG, PNG, or WebP photo (the profile accepts 1–6 valid photos); keep the Baltimore, MD location and default nearby-demo preferences, complete the adult profile gate, and select exactly three initial humor tones.
2. In **Home**, react explicitly to five distinct official posts with **Like** or **Strong like**. Scrolling, wheel input, iframe focus, and moving between cards are neutral; only a successful new positive reaction counts.
3. On the fifth new positive reaction, the app shows one suggestion popup. The counter is in memory for the current document lifetime: in-app navigation keeps it, while a full reload or a new app open resets it to zero. Replacing a reaction or repeating a reaction does not count as another positive.
4. Choose **Match** in the popup. This creates the real eligible profile match and navigates to the real chat; it is not a fake preview and it does not wait for a reciprocal decision. To show the independent Discover path, open **Discover**, like any currently eligible candidate, and use its match/chat action; an eligible profile like creates the match immediately.
5. In chat, review the suggested opener, then press **Send message** yourself. Reload the page and confirm the match, sent message, profile decision, and meme reactions remain persisted before continuing the pitch.
6. Use **Profile → Reset demo** only when restarting the walkthrough. It restores fictional profiles, reactions, decisions, matches, and messages, returns Alex to onboarding, preserves account sessions and local uploads, and never regenerates or deletes optional manually generated media. `npm run db:seed` has the same intentional fictional-progress reset behavior and is not a way to preserve a run.
7. The feed contains the expanded 239-post X archive. Its rows retain source URLs, authors, captions, media types, and collection provenance. The active card may use the third-party X widget when the network and post availability allow it; if X is blocked, deleted, rate-limited, or unavailable, use the stored caption, source link, and honest fallback instead. No xAI key or paid generation is needed for this walkthrough.
8. The feed fits the viewport without relying on page overflow and keeps the active card, previous card, and next three cards warm for responsive navigation; all five warmed X cards may retain native X iframes, while unavailable posts use the stored fallback. Do not present widget availability as proof that every third-party post is still embeddable.

Shared app links use `/?view=memes&post=x-<status-id>`. The post screen loads that official row first, then falls back to the normal feed if the row is unavailable. Every official card also retains an **Open original on X** link to the stored source URL.

### Run bounded browser checks

Playwright uses one serial worker against an already-running application. It does not spawn a second server. Use a disposable demo database: the focused flow exercises actual authentication and profile setup, neutral scrolling and explicit reactions, the fifth-positive suggestion, immediate Discover matching, real chat navigation, message persistence, and reload/reset behavior. External X widget availability is a separate manual check; the automated fallback path must not issue paid xAI requests.

```sh
npx playwright install chromium
# With npm run dev or npm run start already running in another terminal:
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e.spec.ts -g "real reactions create an explainable match"
```

For focused non-browser coverage, run only the bounded seed, matching, and media-state files:

```sh
npx tsx --test tests/x-post-seeds.test.ts tests/core.test.ts tests/video.test.ts
```

Use these as verification instructions, not as a substitute for the manual browser pass. Review the actual UI at 320, 390, 430, 768, 1280, and 1366 pixels wide; automated overflow checks do not replace visual checks for spacing, clipping, or obscured controls.

### Observed manual pitch proof

The manual browser pass observed:

- At 320, 390, 430, 768, 1280, and 1366 pixels, native X widgets and reaction controls fit with zero horizontal overflow.
- At 430, 768, and 1280 pixels, navigation and reload produced zero page errors. Scrolling six posts kept at most five X widgets mounted, and the warmed next iframe was reused.
- After two positive reactions, in-app navigation, and three more positive reactions, the fifth-positive suggestion popup appeared exactly once; two further positive reactions produced no second popup.
- Choosing Match opened the actual chat. A sent message with the shared meme persisted after reload.
- Discover handled a 90px drag and return, an interrupted return followed by a new drag, secondary-touch input, and the 240ms exit transition.
- Public profiles loaded their liked X posts before their photos.

Final curated-run evidence:

- Fresh Alex started with zero photos; uploading one valid JPEG completed onboarding and advanced into the feed. The native original video `2053638074400231779` played for 7.24 seconds without a video error, and the curated larper image `2099933836062630250` was fully visible at 390×844; reaction controls fit and a Like remained pressed/disabled after reload with opacity 1.
- Native X rendering remains third-party dependent: **Show more** or **Open original on X** can leave the app for X, and blocked, deleted, rate-limited, or unavailable posts must use the stored caption/source fallback.
- The final archive has 239 unique rows: the original 39 plus exactly 200 additions. All 200 additions have verified raw citation links across 37 recorded requests and 35 raw responses. The user database retained 239 active official rows, 15 other-table counts, and the original 39 timestamps.
- Final checks passed: 29 unit tests via `npx tsx --test --test-concurrency=2 tests/*.test.ts`, six Playwright tests with one worker (28.9s), `tsc --noEmit`, and the production build.

### Provision real xAI media deliberately

Manual prerequisites for live generation:

- Obtain an xAI API key for a funded account and confirm access to `grok-imagine-image-2.0` and `grok-imagine-video-1.5`, current pricing, quota, and usage-policy requirements.
- Set `XAI_API_KEY` only in the server environment or ignored `.env`, then restart the application. Do not place credentials in browser code, chat, screenshots, or the PR.
- Permit outbound HTTPS to xAI and its approved media delivery hosts. Ensure the configured SQLite/media volume is writable and has sufficient free space.
- Restrict access before attaching a funded key. Authenticated development users can use the Studio. This is not a production administrator provisioning system. The publicly documented fixture password must not protect a publicly exposed funded generation endpoint; keep the demo behind trusted-network or upstream access controls.

**Profile → Open media studio** starts one explicit paid image or six-second video job using the selected controlled taxonomy. Approve the paid-request checkbox first. The browser disables duplicate submissions and retains the same settings and idempotency token when a response is uncertain; use **Retry same job** on that screen rather than creating another paid request. Pending jobs are checked at five-second intervals, at most 60 times over five minutes per checking window. Checks stop on leaving the screen.

For a one-asset integration smoke check, choose one media type in the Studio, approve the paid request, wait for its bounded status checks, and inspect the resulting local `/api/media/:id` asset after completion. Verify local serving after an application restart. Do not infer provider success from the official X feed or from a mocked response. These checks require a funded key and model access and are not part of `db:seed`.

**Live external checks are pending a funded `XAI_API_KEY` and the required model access.** Without those prerequisites, the generation route returns a clear 503 configuration error. The official X walkthrough remains independently usable, but is not evidence that a real xAI image or video has been generated, downloaded, or verified.

### Media maintenance and prototype limits

```sh
# Read-only preview:
npm run media:cleanup
# Apply the previewed cleanup:
npm run media:cleanup -- --apply
```

Cleanup deletes only unreferenced local media files or abandoned `.demo-video-*` temporary directories older than 24 hours. It preserves database-referenced assets, active jobs, recent files, and symlinks. `--apply` is the only deletion flag; the default is a dry run. Resetting the demo is separate and never deletes or regenerates optional manual media or unrelated local uploads.

This remains a single-process, local-storage dating prototype: no production moderation team, identity verification, account recovery/email delivery workflow, realtime messaging, distributed job worker, cloud media store, or production-scale operations are supplied. Block/report controls and an 18+ profile gate do not make a public launch safe. Review submitted reports manually, keep real personal data out of the fixture, and treat compatibility as explainable entertainment rather than a scientific relationship prediction.

Standalone/serverless deployment is not supported because the prototype depends on its complete single-host application, SQLite database, and configured persistent directories. The curated local verification evidence is recorded above; optional live xAI generation remains unverified without a funded key and model access.
