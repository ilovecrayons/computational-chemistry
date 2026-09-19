# Memeant to Be: Technical Implementation Plan

## 1. Goal

Build a localhost-first, mobile-friendly dating prototype that creates compatibility scores from the tags of AI-generated memes users like.

The prototype must support this complete flow:

1. A user creates a basic dating profile.
2. The user reacts to image and video memes.
3. The app builds an explainable meme taste profile.
4. The app ranks compatible people.
5. Two users can like each other and create a match.
6. A match can exchange basic chat messages.

The matching logic should be easy to explain, deterministic, and credible in a hackathon pitch. It should not require model training, embeddings, or a vector database.

## 2. Scope

### MVP requirements

- Mobile-first web application that also works on desktop.
- Local development with one application process and one SQLite database.
- Server-side xAI image and video generation.
- Persistent local copies of generated media.
- Controlled meme tag taxonomy.
- Like, pass, and strong-like reactions.
- Explainable compatibility scores.
- Profile discovery, mutual matching, and basic chat.
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
| External media API | xAI Imagine API | Required image and video generation |
| E2E verification | Playwright | Covers the critical mobile user flow |

### Runtime topology

- The browser talks only to the Next.js application.
- The Next.js server owns the xAI API key.
- Server routes read and write SQLite through Drizzle.
- Generated files are downloaded to local storage and served through a controlled media route.
- No browser request communicates directly with xAI.
- No Redis, queue service, worker process, or object-storage service is required.

## 4. Repository Structure

Use clear feature boundaries without creating unnecessary layers.

| Area | Responsibility |
| --- | --- |
| `app` | Pages, layouts, route handlers, and server actions |
| `components` | Shared product UI components |
| `features/auth` | Session and profile setup behavior |
| `features/memes` | Feed, reactions, generation, and media handling |
| `features/matching` | Taste vectors, compatibility scores, and explanations |
| `features/matches` | Profile decisions and mutual-match creation |
| `features/chat` | Match-gated messages |
| `db` | Schema, migrations, queries, and deterministic seed data |
| `lib/xai` | Server-only xAI client and response mapping |
| `lib/media` | Safe download, persistence, and file lookup |
| `data/media` | Runtime-generated local assets, excluded from source control |

Do not add repository, service, and controller layers unless the implementation becomes difficult to follow without them.

## 5. Configuration

Required environment values:

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | Server-only xAI authorization |
| `DATABASE_URL` | SQLite database location |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `APP_BASE_URL` | Local application origin |
| `DEMO_MODE` | Enables seeded personas and demo reset controls |

The application must fail clearly at startup or at the relevant server route when required configuration is absent. Never expose `XAI_API_KEY` in browser code, serialized page data, or client logs.

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

Stores generated content and provider state.

- ID
- Media type: image or video
- Prompt
- Controlled tags and tag weights as JSON
- Chaos level from 1 to 5
- Taxonomy version
- Local asset path
- Optional poster image path
- Status: queued, generating, ready, failed, or expired
- Provider model
- Provider request ID for asynchronous video jobs
- Failure reason safe for internal display
- Creation and completion timestamps

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

Stores mutual user matches.

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

Do not let the model invent arbitrary labels. Select tags before generation, then build the prompt from those tags. This keeps classification consistent and matching explainable.

### Initial taxonomy

| Dimension | Example values |
| --- | --- |
| Tone | absurd, wholesome, cursed, deadpan, dark, cringe |
| Format | reaction, POV, fake screenshot, starter pack, deep-fried |
| Topic | dating, work, coding, gaming, pets, food |
| Chaos | integer from 1 through 5 |

Each meme should have:

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

### Generation strategy

Pre-generate the demo library before presentation:

- Approximately 60 images.
- Approximately 6 videos.
- A balanced spread across the controlled taxonomy.
- One optional live image generation during the pitch.
- No live video generation in the critical demo path.

At the xAI pricing consulted for this plan, 60 images at $0.04 each plus six 6-second videos at $0.08 per second is approximately $5.28 before retries or text-model usage. Confirm pricing and model access before the event.

### Safety and reliability

- Keep all generation controls behind an authenticated development-only or admin-only surface.
- Use an idempotency token so a double click cannot start duplicate paid jobs.
- Limit concurrent generation requests.
- Store a human-readable failure state without leaking provider credentials.
- Do not automatically retry moderation failures.
- Provide a static fallback asset when a feed item becomes unavailable.

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
| `POST /api/profile-decisions` | Store like or pass and create a mutual match when applicable |
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

## 12. Mutual Match Creation

Compatibility ranking does not create a match by itself.

1. User A likes User B.
2. The server stores the decision once.
3. The server checks for an existing reciprocal like.
4. If present, create one match for the canonical user pair inside a transaction.
5. Persist the current compatibility explanation with the match.
6. Return a match-created response so the UI can show the reveal.

A repeated request must return the existing match rather than create a duplicate.

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

- Support local email/password accounts.
- Seed several clearly fictional demo personas.
- Store date of birth and enforce an 18+ gate.
- Keep dating preferences private.
- Do not expose exact location.
- Include block and report entry points if any non-team users can interact.
- Escape and validate all user-created text.
- Authorize every profile, match, message, generation, and media operation server-side.
- Keep generated meme prompts and content within xAI usage rules.

The project must be presented as a prototype, not a production-ready dating service.

## 15. Seed and Demo Data

Create deterministic seed data for:

- 8 to 12 fictional adult profiles.
- Multiple preference combinations.
- At least 25 meme reactions per seeded profile.
- Several intentionally high-compatibility pairs.
- Several low-compatibility pairs.
- One reciprocal profile like that can produce a match during the demo.
- A small existing chat for visual verification.

The current demo user should start without a tasteprint. Their live reactions must materially change candidate ranking.

Demo reset should restore database records while preserving the pre-generated local media library.

## 16. Delivery Phases

### Phase 1: Foundation

- Initialize Next.js, TypeScript, styling, and local configuration.
- Add Drizzle schema and migrations.
- Add authentication and profile setup.
- Add deterministic seed and reset behavior.

Acceptance: two seeded users can sign in locally and retain sessions.

### Phase 2: Meme library

- Implement taxonomy-aware prompt assembly.
- Implement image generation and local persistence.
- Implement asynchronous video state handling.
- Pre-generate and review the demo library.

Acceptance: ready media remains usable after provider URLs expire.

### Phase 3: Reaction loop

- Build cursor-based feed retrieval.
- Persist idempotent reactions.
- Implement calibration coverage.
- Expose tasteprint data after the minimum threshold.

Acceptance: refreshes do not lose or duplicate reactions, and the derived tag profile changes predictably.

### Phase 4: Matching

- Implement preference filtering.
- Implement weighted vectors and compatibility scores.
- Return contribution-based explanations.
- Build profile decisions and transactional mutual matching.

Acceptance: seeded high-overlap users rank above low-overlap users, and reciprocal likes create exactly one match.

### Phase 5: Chat and demo polish

- Add match-gated messages.
- Add the shared-meme opener.
- Complete loading, empty, failure, and reset states.
- Verify the mobile flow and prepare the presentation dataset.

Acceptance: a user can complete the entire demo without manual database changes.

## 17. Verification

### End-to-end scenario

Run the actual application at a mobile viewport and verify:

1. Sign in as the fresh demo user.
2. Complete the required profile fields.
3. React to at least 15 memes containing both images and videos.
4. Open the tasteprint and confirm its labels reflect those reactions.
5. Open candidates and confirm the intended seeded profile ranks first.
6. Like that profile and trigger the seeded reciprocal match.
7. Open chat and send a message tied to a shared meme.
8. Reload and confirm the feed, match, and message persist.
9. Reset the demo and confirm the starting state returns.

### Focused automated coverage

Keep permanent tests only for behavior that is easy to regress:

- Reaction uniqueness and replacement.
- Compatibility ordering for a fixed dataset.
- Cold-start behavior below the reaction threshold.
- Preference filtering before scoring.
- Idempotent mutual-match creation.
- Message authorization.
- Video job state mapping for done, failed, and expired responses.

### External integration smoke checks

- Generate and persist one real image.
- Generate, poll, and persist one real short video.
- Confirm the application still serves both files after the temporary URLs are no longer used.

## 18. Main Risks

| Risk | Mitigation |
| --- | --- |
| Temporary xAI URLs | Download every successful asset immediately |
| Video latency | Pre-generate demo videos and keep live video off the pitch path |
| Duplicate paid requests | Idempotency tokens and disabled in-progress controls |
| Provider failure or expiration | Explicit job states and static feed fallback |
| Weak matching signal | Require calibration and use a controlled tag vocabulary |
| Fake-looking compatibility | Show shared tags and memes instead of only a percentage |
| Empty demo population | Seed realistic profiles and reaction histories |
| Secret leakage | Keep all xAI operations server-only |
| Unsafe generated content | Review the demo library before presentation |
| Local media growth | Set file-size limits and provide a development cleanup command |

## 19. Definition of Done

The MVP is complete when:

- A clean checkout can run locally with documented environment variables.
- The database can be migrated and seeded deterministically.
- Generated media is locally persistent.
- A fresh user can build a tasteprint through real reactions.
- Candidate order is produced by the documented matching algorithm.
- Compatibility explanations match stored reaction data.
- Reciprocal profile likes create one match.
- Matched users can exchange persistent messages.
- The full flow works at a mobile viewport and in the centered desktop presentation.
- The demo can be reset without regenerating paid media.

## 20. Local Setup and Manual Provisioning

This section describes the implemented local prototype, not a managed deployment service. Run commands from the repository root. The ordinary demo never requires an xAI key; actual xAI generation does.

### Prerequisites and environment

- Use Node.js 22.12 or newer (Node.js 24 LTS recommended) and npm. A native `better-sqlite3` installation may require Python 3, `make`, and a C++ compiler if a prebuilt binary is unavailable.
- Install `ffmpeg` with SVG decoding through `librsvg` and H.264 encoding through `libx264`. On Ubuntu, install the distribution's `ffmpeg` package. It is required to provision the six real offline MP4 clips, not to replace them with static images. A missing encoder produces a clear provisioning failure. Provisioning also writes the fictional portraits into `public/demo`.
- Keep the application, SQLite database, and media on one machine for this prototype. The runtime account must be able to write the database directory, its SQLite WAL/SHM files, and the media directory. Demo provisioning/reset also needs write access to `public/demo`.

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
# XAI_API_KEY can remain empty for the illustrated offline demo.
```

`APP_BASE_URL` must be the exact origin used in the browser: `localhost` and `127.0.0.1` are not interchangeable for cookies and write-origin checks. Use HTTPS and the actual trusted origin for a hosted instance; do not send sessions or credentials over a public HTTP connection. Never use a `NEXT_PUBLIC_` variable for secrets. `DATABASE_URL` is a local SQLite filename with an optional `file:` prefix, not a hosted SQL connection string. `MEDIA_DIR` optionally overrides the default `./data/media`.

For persistence outside localhost, configure absolute paths on a writable persistent volume, for example `DATABASE_URL=file:/srv/memeant/memeant.db` and `MEDIA_DIR=/srv/memeant/media`. Back up the database and referenced media together. Ephemeral/serverless filesystems, multiple application replicas, and shared-network SQLite storage are not supported by this prototype.

If using a reverse proxy, overwrite client-supplied forwarding/IP headers at that trusted boundary; authentication rate limiting must not trust arbitrary public `X-Forwarded-For` values. Keep direct access to the application port private.

### Migrate, provision the offline library, and run

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. `db:migrate` applies the idempotent local migration runner. `db:seed` creates the fictional accounts, provisions missing offline media, and restores the deterministic demo records; it is a reset command, not a way to preserve current demo progress.

The offline library contains 60 original SVG meme illustrations, six playable silent six-second MP4 animations, and ten fictional illustrated portraits. It is visibly identified as an **offline illustrated demo**, not represented as xAI-generated media. No provider calls or paid generation happen during seeding. Existing durable media is reused. To provision or repair just this local library, without explicitly reseeding the personas:

```sh
npm run media:demo
```

For a production-mode local run, finish provisioning before starting the built server:

```sh
npm run build
npm run start
```

`npm run dev` and `npm run start` bind to `0.0.0.0`; apply host/firewall restrictions if this machine is on an untrusted network. Run only one server on port 3000. The package also exposes `npm run typecheck`, `npm test`, and `npm run test:e2e`.

### Fictional accounts and repeatable walkthrough

Every demo account uses the password `Memeant-demo-2026!`. The addresses are:

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

These are fictional adult fixtures, not real people or production credentials. Sign in as Alex, complete the profile, select exactly three initial humor tones, and give the first 15 memes a normal **LOL** reaction. That sequence includes images and video and produces the intended top-ranked Jules profile. Jules has a seeded reciprocal like, so liking Jules creates a mutual match. The suggested chat opener only fills the composer; press **Send message** to persist it with the shared meme reference.

Alex starts with an incomplete profile and no reaction-derived tasteprint; initial profile tags do not manufacture a compatibility score. **Me → Reset demo** restores fictional profiles, reactions, decisions, matches, and messages while keeping account sessions and durable media. Alex returns to onboarding after reset. Complete the adult profile gate again before reading the protected feed, tasteprint, candidates, or messages.

### Run the requested browser checks

Playwright uses one serial worker against an already-running application. It does not spawn a second server. Use a disposable demo database: the tests deliberately reset fictional demo progress and then exercise actual authentication, profile setup, image/video reactions, Jules ranking, mutual matching, an unsent-then-explicitly-sent shared-meme opener, reload persistence, reset preservation, required responsive widths, and dialog keyboard focus. Additional regressions hold real network responses to verify draft preservation during slow sends and recovery of messages missed between polls. No fake application responses or paid xAI requests are used.

```sh
npx playwright install chromium
# With npm run dev or npm run start already running in another terminal:
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

On a minimal Linux host, install Playwright's Chromium system dependencies as well (`npx playwright install --with-deps chromium`, with the required package-management privileges). `PLAYWRIGHT_BASE_URL` must match the application's `APP_BASE_URL`. The default is port 3000. Review the actual UI at 320, 390, 430, 768, and 1280 pixels wide; automated overflow checks do not replace visual checks for spacing, clipping, or obscured controls.

### Provision real xAI media deliberately

Manual prerequisites for live generation:

- Obtain an xAI API key for a funded account and confirm access to `grok-imagine-image-2.0` and `grok-imagine-video-1.5`, current pricing, quota, and usage-policy requirements.
- Set `XAI_API_KEY` only in the server environment or ignored `.env`, then restart the application. Do not place credentials in browser code, chat, screenshots, or the PR.
- Permit outbound HTTPS to xAI and its approved media delivery hosts. Ensure the configured SQLite/media volume is writable and has sufficient free space.
- Restrict access before attaching a funded key. Authenticated development users can use the studio; production-mode demo administration is restricted to the Alex fixture with `DEMO_MODE=true`. This is not a production administrator provisioning system. The publicly documented fixture password must not protect a publicly exposed funded generation endpoint; keep the demo behind trusted-network or upstream access controls.

**Me → Open media studio** starts one explicit paid image or six-second video job using the selected controlled taxonomy. Approve the paid-request checkbox first. The browser disables duplicate submissions and retains the same settings/idempotency token when a response is uncertain; use **Retry same job** on that screen rather than creating another paid request. Pending jobs are checked at five-second intervals, at most 60 times over five minutes per checking window. Checks stop on leaving the screen, pause in hidden tabs, and can be resumed explicitly without creating a paid job. Failed and expired jobs remain distinct from ready media.

For the complete pre-generated xAI presentation library:

```sh
npm run media:generate -- --confirm --batch pitch-2026 --images 60 --videos 6
```

`--confirm` is explicit paid consent. `--batch` is required and accepts 1–70 letters, digits, underscores, or hyphens. `--images` accepts 0–60; `--videos` accepts 0–6; at least one asset must be requested. The defaults are 60 and 6. Reuse the exact batch key and settings to resume an interrupted batch rather than creating duplicate paid jobs. A new batch key means new paid work. The CLI checks pending jobs in a bounded window of at most 180 five-second polls per job; it does not run a hidden infinite worker or automatically retry paid failures.

For a smaller explicit integration smoke check:

```sh
npm run media:generate -- --confirm --batch live-smoke-2026 --images 1 --videos 1
```

Review each generated image/video and its local `/api/media/:id` asset before presenting it. Verify that both media types remain playable from local storage without using provider URLs, including after an application restart. Do not infer provider success from the offline demo or a mocked response.

**Live external checks are pending a funded `XAI_API_KEY` and the required model access.** Without those prerequisites, the generation route returns a clear 503 configuration error. The offline walkthrough is independently usable, but is not evidence that a real xAI image/video or the paid library has been generated, downloaded, or verified.

### Media maintenance and prototype limits

```sh
# Read-only preview:
npm run media:cleanup
# Apply the previewed cleanup:
npm run media:cleanup -- --apply
```

Cleanup deletes only unreferenced media files or abandoned demo-video temporary directories older than 24 hours. It preserves database-referenced assets, active jobs, recent files, and symlinks. `--apply` is the only deletion flag; the default is a dry run. Resetting the demo is separate and never deletes or regenerates the paid library.

This remains a single-process, local-storage dating prototype: no production moderation team, identity verification, account recovery/email delivery workflow, realtime messaging, distributed job worker, cloud media store, or production-scale operations are supplied. Block/report controls and an 18+ profile gate do not make a public launch safe. Review submitted reports manually, keep real personal data out of the fixture, and treat compatibility as explainable entertainment rather than a scientific relationship prediction.

The verified production build currently emits three Turbopack file-tracing warnings for dynamic local-media filesystem paths. Compilation and the running application pass their checks; these warnings do not establish that a standalone/serverless bundle is supported. Deploy the complete single-host application with its configured persistent directories.
