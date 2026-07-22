# Design QA — Glass Ocean

- Source visual truth: `C:\Users\Mustafa\Downloads\01_glass_ocean.png`
- Implementation screenshot: `C:\Users\Mustafa\Documents\Codex\2026-07-20\cal\work\glass-preview\login-preview-2.png`
- Full comparison: `C:\Users\Mustafa\Documents\Codex\2026-07-20\cal\work\glass-preview\login-comparison.png`
- Focused comparison: `C:\Users\Mustafa\Documents\Codex\2026-07-20\cal\work\glass-preview\login-focused-comparison.png`
- Viewport and state: desktop, 1440 × 900 CSS px, login ready for Microsoft Entra.
- Pixel normalization: source 1440 × 900 px; implementation 1440 × 900 px; density 1:1.

## Findings

No actionable P0, P1 or P2 differences remain.

- Fonts and typography: hierarchy, weights, wrapping and institutional tracking follow the reference. The implementation uses Space Grotesk, Inter and JetBrains Mono as close web-safe equivalents.
- Spacing and layout rhythm: card size, centered composition, header/footer anchors, padding, border radius and control spacing align with the reference.
- Colors and visual tokens: deep navy-to-ocean gradient, soft warm edge, translucent glass surface and restrained white borders match the target atmosphere.
- Image quality and asset fidelity: the existing Cámara de Ceuta logo is reused directly; the Microsoft mark uses the official Wikimedia-hosted asset rather than a code-drawn approximation.
- Copy and content: the login uses the reference wording and preserves the real Microsoft Entra action.

## Full-view Evidence

The side-by-side comparison shows equivalent overall composition, background direction, card position, visual weight and footer placement. The portal dashboard extends the same glass language while retaining its existing information architecture.

## Focused Evidence

The focused card comparison confirms matching logo scale, heading hierarchy, descriptive copy width, button height, divider and trust message placement.

## Comparison History

1. Initial capture used a full-page browser screenshot before the viewport settled, producing an invalid narrow render. No design conclusion was taken from it.
2. The page was recaptured at a verified 1440 × 900 viewport after fonts and animations settled. The normalized full and focused comparisons showed no P0/P1/P2 mismatch.
3. A minor P3 copy drift (`herramientas`) was corrected to the reference term (`tarjetas`).

## Interaction and Responsive Checks

- The login and dashboard rendered successfully in the in-app browser.
- The dashboard JavaScript initialized and produced the three authorized project cards.
- Authentication, permissions, project URLs, filters and search logic were not changed.
- A later mobile recapture was blocked by the browser URL policy; responsive CSS was reviewed statically at the existing 760 px and 440 px breakpoints.

## Follow-up Polish

- Optional P3: replace the remotely hosted Microsoft logo with a locally bundled asset if a stricter content-security policy is introduced.

final result: passed
