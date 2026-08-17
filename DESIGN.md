# Shopport mobile design

Shopport is a Korean shopping comparison assistant. Its interface should help people state a need, clarify constraints, and compare real products without making the conversation feel like a terminal or a technology demo.

## Principles

- Put the shopping task first. Use plain Korean labels and show only information that helps a person ask, answer, compare, or recover.
- Preserve the existing neutral light and dark palettes. Kakao yellow remains reserved for the functional Kakao sign-in action; it is not a general brand accent.
- Use the platform UI sans font and native text behavior for all non-code interface text. Do not use monospace, uppercase transforms, or wide letter spacing as visual chrome.
- Build hierarchy with readable type sizes, weight, spacing, and solid surface contrast. Keep body copy at a comfortable line height and allow system font scaling.
- Use the shared 4, 8, 12, 16, 24, and 32 spacing scale. Prefer clear grouping over dense decoration.
- Use a small, intentional corner scale: 4px for compact elements, 8px for controls and media, and 12px for larger cards and message surfaces. Pills are limited to controls whose shape communicates their behavior.
- Keep surfaces solid and borders quiet. Do not use gradients, glass effects, decorative shadows, or simulated depth.

## Components

### Conversation

- Distinguish user and Shopport messages with surface and alignment, not novelty typography or ornamental avatars.
- Keep the composer visually stable across draft loading, offline mode, upload processing, and response streaming.
- Use the NewChat footer as the shared composer surface for new and existing conversations.
- Present attachment processing and recovery next to the attachment. Status text must remain understandable without color.
- Product results may scroll horizontally when space is constrained, but product names, prices, availability, and seller context take priority over imagery.
- Clarifying questions should expose a focused set of useful choices. Do not add badges, fake confidence scores, fake activity, or decorative metadata.

### Actions and inputs

- Primary actions use the existing neutral primary fill; secondary actions use a solid surface and border; destructive actions use the existing danger color.
- Use concise Korean verbs such as `전송`, `첨부`, and `이미지 제거`. Avoid marketing claims and AI-centric language.
- Interactive targets should be at least 44 points, include accessible roles and states, and remain usable with scaled text.
- Disabled, loading, offline, error, and focus states must be explicit. Do not rely on opacity or color alone when the state needs explanation.

## Content and accessibility

- Preserve the meaning and tone of established Korean copy. Prefer direct, calm recovery instructions over playful or promotional language.
- Provide accessibility labels for icon-only or ambiguous controls, live regions for asynchronous status, and sufficient contrast in both themes.
- Respect safe areas, the keyboard, reduced motion expectations, and platform conventions. Haptics reinforce completed user actions; they do not replace visible feedback.

## Avoid

- Terminal-inspired styling, monospace UI labels, wide-tracked controls, and AI-startup imitation
- New brand colors, unnecessary icons, badge spam, fake statistics, and marketing copy
- Gradients, glass, decorative shadows, excessive rounding, and ornamental animation
- Hiding offline, draft, upload, polling, or failure states for a cleaner-looking screen
