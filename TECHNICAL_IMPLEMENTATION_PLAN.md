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
