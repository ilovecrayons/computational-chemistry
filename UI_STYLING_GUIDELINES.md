# Computational Chemistry: UI and Styling Guidelines

## 1. Design Read

A mobile-first dating product for young adults, with fast familiar interactions, chaotic meme content, and a restrained interface. The product should feel internet-native and funny without looking like a generic AI application or an imitation of one dating app.

Design dials:

- Design variance: 7 out of 10
- Motion intensity: 6 out of 10
- Visual density: 5 out of 10

The memes provide visual chaos. The application chrome stays clear and consistent.

## 2. Product Personality

### Brand promise

Find someone who laughs at the same garbage.

### Personality traits

- Playful, not childish.
- Self-aware, not cynical.
- Fast, not frantic.
- Weird, not visually incoherent.
- Honest about compatibility, not falsely scientific.

### Naming

Product name: **Computational Chemistry**

Use this product name consistently in the interface, metadata, and documentation.

## 3. Experience Principles

### Memes first, profiles second

Users should react naturally to content before seeing who liked the same material. Do not put profile photos beside memes in the calibration feed.

### Familiar controls, original loop

Borrow common dating-app interaction patterns:

- One clear decision at a time.
- Explicit mutual match before chat.
- A reaction can target a specific piece of content.
- A shared object provides the conversation opener.

Do not copy one competitor's complete navigation, icons, colors, or swipe economy.

### Taps before gestures

Every important action must have a visible button. Swiping may provide a shortcut, but the product must remain fully usable without discovering hidden gestures.

### Explain the result

A compatibility percentage is not enough. Every result should include shared tags or memes that explain why the person appeared.

### Keep the joke in the content

Avoid covering memes with large labels, badges, gradients, or decorative effects. The frame around the meme should remain quiet.

## 4. Visual Foundation

Use a light theme for the hackathon. Do not add dark mode unless the light experience is complete and verified.

### Color tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F6F4EF` | Main background |
| Surface | `#FFFFFF` | Raised sheets and controls |
| Ink | `#111111` | Primary text and icons |
| Muted ink | `#67645F` | Secondary text |
| Divider | `#D8D3CB` | Borders and separators |
| Accent | `#FF4F64` | Primary actions and selected state |
| Accent active | `#E83F55` | Pressed primary action |
| Error | `#B42318` | Errors and destructive confirmation |
| Success | `#247A52` | Confirmed success state only |
| Scrim | `rgba(17,17,17,0.72)` | Controls over media |

Rules:

- Coral is the only brand accent.
- Use black text on the coral accent for reliable contrast.
- Reserve red and green semantic colors for actual errors and success.
- Do not use purple and blue AI gradients.
- Do not change the page into a dark theme between sections.
- Do not place important text directly over a busy meme without a solid or strongly scrimmed surface.

## 5. Typography

Use **Space Grotesk** through `next/font` for the entire product. A single family keeps the chaotic media from making the interface feel fragmented.

### Type scale

| Role | Size / line height | Weight |
| --- | --- | --- |
| Display | 36 / 38 | 700 |
| Screen title | 28 / 32 | 700 |
| Section title | 22 / 28 | 650 or 700 |
| Card title | 18 / 24 | 650 |
| Body | 16 / 24 | 400 |
| Body strong | 16 / 24 | 600 |
| Supporting | 14 / 20 | 400 or 500 |
| Caption | 12 / 16 | 500 |

Rules:

- Keep onboarding and match-reveal headlines to two lines.
- Use sentence case for buttons and labels.
- Avoid all-caps tracking as a decorative default.
- Use tabular numerals for compatibility percentages.
- Do not introduce a display serif for personality.
- Never shrink primary text below 16px to make content fit.

## 6. Spacing and Shape

Use a 4px base spacing unit.

Primary spacing values:

- 4px: icon and micro-label adjustment
- 8px: tightly related content
- 12px: compact control padding
- 16px: standard horizontal page padding
- 24px: component separation
- 32px: section separation
- 48px: major screen separation

### Radius system

- Meme and profile media: 16px
- Cards and sheets: 16px
- Inputs and rectangular controls: 12px
- Primary and secondary buttons: 12px
- Circular action controls and avatars: fully round

Do not mix arbitrary 6px, 20px, and 32px radii. Do not make every label a pill.

### Shadows

Use borders and spacing before shadows. If elevation is necessary, use a soft neutral shadow tinted toward the canvas. Avoid black floating-card shadows and glowing accent shadows.

## 7. Responsive Layout

### Mobile baseline

Design first at 390px wide and verify at:

- 320px narrow mobile
- 390px standard mobile
- 430px large mobile
- 768px tablet
- 1280px desktop

Mobile rules:

- Use `100dvh` behavior for full-height screens.
- Respect top and bottom safe areas.
- Use 16px horizontal page padding.
- Keep interactive targets at least 44px square.
- Reserve space for the persistent bottom navigation.
- Do not let fixed action controls obscure captions or system browser controls.

### Desktop presentation

At desktop sizes:

- Keep the primary product surface between 390px and 430px wide.
- Center it within the viewport.
- Use the surrounding canvas as breathing room, not as a fake phone bezel.
- An optional side panel may show the current tasteprint or demo controls at widths above 1024px.
- Never stretch a vertical meme across the entire desktop window.

## 8. Navigation

Use four bottom-navigation destinations:

1. **Memes**
2. **Matches**
3. **Chats**
4. **Me**

Navigation rules:

- Use one icon family, preferably Phosphor Icons.
- Pair every navigation icon with a visible text label.
- Use the coral accent for the selected destination.
- Keep unselected items visually quiet but readable.
- Do not place generation or admin controls in the main navigation.
- Preserve the selected destination across reloads when practical.

## 9. Onboarding

Keep onboarding to three short screens:

1. Account and 18+ confirmation.
2. Basic profile and dating preferences.
3. Three initial humor tags and the start of meme calibration.

Guidelines:

- Show progress as simple text such as “2 of 3,” not a large filled progress bar.
- Ask only for information required by the demo.
- Explain that humor tags are a starting point and reactions will replace assumptions.
- Keep one primary action at the bottom of each screen.
- Validate fields inline.
- Never rely on toast messages for form errors.

Suggested opening copy:

- Title: “Your sense of humor is now a dating criterion.”
- Supporting text: “Rate a few terrible memes. We will find someone with compatible damage.”
- Primary action: “Judge memes”

## 10. Meme Feed

The feed is the main product surface.

### Layout

- Compact top bar with wordmark and optional reaction count.
- One dominant vertical meme at a time.
- Media uses a 9:16 container with `object-fit: cover` only when cropping is safe.
- Short caption or generation context below the media when needed.
- Fixed action area above the bottom navigation.

### Actions

Primary visible actions:

- **Nah**: neutral outlined control.
- **LOL**: coral primary control.
- **Too good**: smaller strong-like control with a clear icon.

Rules:

- Tapping an action immediately advances to the next meme.
- A short undo option may appear after a pass, but is not required.
- Optional left or right swipe gestures must mirror the visible controls.
- Vertical movement remains reserved for page and feed scrolling.
- Strong-like must not look like a paid feature in the prototype.
- Use tactile pressed states with a small scale or vertical shift.

### Tag reveal

Do not show classification tags before a reaction. After the action, briefly reveal two or three tags while the next item enters. This makes the matching logic visible without biasing the initial decision.

### Video behavior

- Autoplay only when the video is visible.
- Start muted and provide a clear sound toggle.
- Loop clips only when they are short and the user has not moved on.
- Use a poster image to avoid blank loading states.
- Pause when the document is hidden or the item leaves the viewport.
- Do not make audio necessary to understand the reaction choice.

## 11. Tasteprint

The tasteprint translates reactions into understandable results.

### Content hierarchy

1. Short summary sentence.
2. Three strongest humor dimensions.
3. A compact list of supporting tags.
4. Calibration confidence or reaction count.
5. Action to see compatible people.

Example:

- “Your humor is mostly cursed pets, workplace despair, and deadpan nonsense.”
- “Built from 18 reactions.”

Use horizontal proportion bars only if they communicate actual relative weights. Do not fake precision with radar charts, DNA graphics, scientific diagrams, or percentages that cannot be explained.

## 12. Candidate Profiles

Profiles should feel like people rather than scorecards.

### Profile order

1. Primary photo and name.
2. Age and broad location only.
3. Short bio or one prompt answer.
4. Compatibility score.
5. Two-line explanation.
6. Shared tags and up to two shared memes.
7. Pass and like actions.

### Compatibility presentation

- Keep the percentage visible but secondary to the person.
- Use language such as “Meme compatibility,” not “Soulmate probability.”
- Show the top shared factors immediately.
- Provide a compact “Why this match?” expansion for full details.
- Never imply that the score predicts relationship success.

Example explanation:

> You both over-index on cursed animals and fake corporate posts.

### Profile actions

- **Pass** uses a neutral outlined button.
- **Like** uses the coral primary button.
- An optional comment attaches to a specific shared meme, following the useful content-level reaction pattern found in Hinge.

## 13. Match Reveal

The mutual-match moment is the main emotional payoff.

### Composition

- Full-screen sheet or modal over the existing screen.
- Both profile images remain visible.
- Headline: “Same damage. Mutual interest.”
- One shared meme appears as the conversation context.
- Primary action: “Say something”
- Secondary action: “Keep browsing”

### Motion

- Use one short 500 to 700ms reveal sequence.
- Scale and opacity are sufficient.
- A few restrained paper-confetti shapes are acceptable.
- Do not use a looping animation or particle field.
- Respect reduced-motion preferences by using a simple fade.

## 14. Matches and Chats

### Matches list

- New matches appear first.
- Show avatar, name, compatibility summary, and last activity.
- Use a small shared-meme thumbnail where it adds recognition.
- Do not wrap every row in a floating card. Use spacing and separators.

### Chat

- Keep the shared meme pinned as compact opening context until the first message is sent.
- Offer one suggested opener, but never send it automatically.
- Use conventional left and right message alignment.
- Keep the composer fixed above the safe area.
- Provide a visible overflow menu for unmatch, block, and report.
- Do not add typing indicators, read receipts, voice notes, or attachments for the MVP.

Suggested opener:

> Explain why this destroyed both of you.

## 15. Profile and Settings

The profile screen should contain:

- Photos and public profile fields.
- Dating intent and private preferences.
- Humor taste summary.
- Reaction count.
- Account and safety controls.
- Demo persona switcher and reset controls only when demo mode is enabled.

Keep internal algorithm controls and raw tag weights out of the standard user profile. They may appear in a clearly separated demo-inspector panel.

## 16. Component Guidelines

### Buttons

- Primary: coral background, black label, 48px minimum height.
- Secondary: white or transparent background, dark border, dark label.
- Destructive: error color only after the destructive intent is clear.
- Icon-only controls require accessible labels and at least a 44px target.
- Button text should stay on one line and use no more than three words when possible.

### Inputs

- Visible labels remain above inputs.
- Placeholder text is supplemental, never the only label.
- Use a 48px minimum input height.
- Use a dark 2px focus ring with a small offset.
- Show validation close to the affected field.

### Cards

Use cards only for grouped interactive objects such as the active meme or candidate profile. Lists, settings, and explanations should prefer spacing and dividers. Avoid cards nested inside cards.

### Tags

- Tags are evidence, not decoration.
- Use small rounded rectangles rather than full pills.
- Show no more than three tags by default.
- Provide an expansion for the rest.
- Keep all tag labels in sentence case.

### Icons

- Use Phosphor Icons consistently.
- Standardize icon weight across the application.
- Do not draw custom SVG interface icons.
- Do not mix emoji with interface icons.

## 17. Motion and Feedback

Motion must communicate feedback or state change.

| Interaction | Duration | Behavior |
| --- | --- | --- |
| Button press | 80 to 120ms | Small scale or downward shift |
| Meme decision | 180 to 240ms | Short lateral exit and next-item entrance |
| Tag reveal | 200 to 300ms | Fade and small vertical movement |
| Sheet open | 250 to 350ms | Translate from bottom with opacity |
| Match reveal | 500 to 700ms | Staged scale and fade |
| Toast | 180 to 240ms | Fade and short vertical movement |

Rules:

- Animate transform and opacity where possible.
- Do not run continuous decorative motion.
- Never block the next reaction while a decorative animation finishes.
- Provide a reduced-motion path for every transition.
- Pause video and animation when content is not visible.

## 18. Loading, Empty, and Error States

### Loading

- Use skeletons shaped like the final content.
- Show the meme poster while a video buffers.
- Disable duplicate actions while a write is in progress.
- Avoid generic full-screen spinners.

### Empty

Examples:

- No unseen memes: “You judged the entire internet. More nonsense is being prepared.”
- No candidates: “Your taste is currently too powerful. React to a few more memes.”
- No matches: “Compatible chaos will appear here.”
- No messages: keep the shared meme and opener visible.

### Errors

- Keep the current user's action recoverable.
- Use inline error text for forms and contextual errors for media.
- Give generation failures a retry action only when another paid request is appropriate.
- Never expose raw provider responses or stack traces.
- A failed meme asset should be skipped without breaking the feed.

## 19. Accessibility

Minimum requirements:

- WCAG AA color contrast for text and controls.
- 44px minimum touch targets.
- Complete keyboard access on desktop.
- Visible focus indicators.
- Semantic buttons rather than clickable containers.
- Accessible names for every icon-only control.
- Alt text that describes the meme content without relying only on its tags.
- Captions or equivalent context for videos with meaningful speech.
- No essential information conveyed only by color.
- Reduced-motion support.
- Zoom support without clipped navigation or dialogs.
- Logical focus movement when a sheet or match reveal opens and closes.

Humor must not rely on flashing content, rapid forced transitions, or unexpectedly loud audio.

## 20. Safety and Trust UI

Even as a prototype:

- Show age and broad location, never exact location.
- Keep report, block, and unmatch actions discoverable.
- Confirm destructive actions in plain language.
- Explain that compatibility is entertainment and a ranking aid, not a scientific prediction.
- Do not reveal another user's private preferences or full reaction history.
- Label seeded demo profiles as fictional in demo-only surfaces.
- Never display internal generation prompts if they contain private user data.

## 21. Copy Style

### Voice

Use short, specific, deadpan copy. The product may joke about memes and internet taste, but never mock a user's body, identity, protected characteristics, or dating preferences.

### Good examples

- “Judge memes”
- “Same damage. Mutual interest.”
- “Built from 18 reactions.”
- “You both liked deeply unhelpful workplace advice.”
- “Explain yourselves.”

### Avoid

- Generic AI language such as “Unlock meaningful connections.”
- Claims such as “AI found your soulmate.”
- Long whimsical paragraphs.
- Scientific-sounding claims the algorithm cannot defend.
- Excessive exclamation marks.
- Emoji as interface labels.

## 22. Design Patterns Used as References

The design should synthesize, not reproduce, these observed patterns:

- Tinder uses fast binary discovery decisions and gates messaging behind a mutual match.
- Hinge allows a Like or comment on a specific profile element.
- Bumble combines profile discovery with prompt-led conversation starts.
- Tinder's current product direction emphasizes clean, immersive, edge-to-edge profile media.

References:

- [Tinder product direction](https://www.tinderpressroom.com/2026-03-12-Tinder-Debuts-Inaugural-Product-Keynote-Tinder-Sparks-2026-Start-Something-New)
- [Tinder Like and match behavior](https://www.help.tinder.com/hc/en-us/articles/115005246123-Likes)
- [Hinge content-level Likes and comments](https://help.hinge.co/hc/en-us/articles/360011090134-How-Do-I-Match-with-Someone-and-Start-Chatting)
- [Bumble People discovery](https://support.bumble.com/hc/en-us/articles/28423154479645-Using-the-People-tab)
- [Bumble Opening Moves](https://support.bumble.com/hc/articles/28776942830365-Setting-Opening-Moves)

## 23. Patterns to Avoid

- Purple AI gradients and glowing buttons.
- Glass effects on every control.
- A full Tinder clone with different colors.
- Hidden gesture-only actions.
- Profile photos in the initial meme-calibration feed.
- Tags shown before the user reacts.
- Multiple accent colors competing with meme content.
- Cards nested inside cards.
- Decorative scientific charts.
- Compatibility percentages without evidence.
- Autoplay video with sound.
- Tiny captions and controls over busy media.
- Infinite motion or confetti.
- Desktop layouts that stretch mobile media edge to edge.
- Excessive pills, badges, and uppercase micro-labels.

## 24. UI Completion Checklist

Before calling the UI complete, verify:

- The primary flow works at 320px, 390px, and 430px widths.
- Bottom navigation and fixed actions respect safe areas.
- Every important action has a visible button.
- Meme tags remain hidden until after reaction.
- Image and video memes have stable loading dimensions.
- Videos start muted and pause offscreen.
- The tasteprint reflects real reaction data.
- Every candidate score includes shared evidence.
- The mutual-match reveal has a reduced-motion version.
- Chat opens with useful shared-meme context.
- Loading, empty, error, and offline-adjacent states are present.
- Buttons and form fields meet touch-size and contrast requirements.
- Keyboard focus remains visible and correctly contained in dialogs.
- The application uses one font family, one accent, and the defined radius system.
- No generated content is obscured by decorative interface elements.
- The desktop view presents the mobile product cleanly without pretending to be a device mockup.
