# Canteen Sim manga sharing image

Created 2026-10-05 with the built-in imagegen tool.

- Social image: [1200 × 630 JPEG](../public/og/canteen-sim-manga-v1.jpg).
- Original generated artwork: [1730 × 909 PNG](assets/canteen-og-manga-v1.png).
- Text: **Canteen Sim** and **ศึกชิงโต๊ะพักเที่ยง**.
- Direction: energetic, funny Japanese action manga; office workers rushing into a lunch hall;
  black ink, screentones, and selective vermilion and teal.

The JPEG is a proportionate export at 1200 px wide with a centred 1 px vertical crop to 630 px height,
made with macOS `sips` at JPEG quality 88. No lettering or artwork was redrawn during export.
The image was visually reviewed for readable Thai and English text, a recognisable lunch hall,
coherent running poses and legibility at preview size.

`index.html` contains Thai sharing text, the absolute production image URL, dimensions and descriptive
alternative text, using the [Open Graph image properties](https://ogp.me/#structured). Vite copies the image
from `public/og/` to `dist/og/`; the normal page does not request it. The local HTML remains independently
usable offline. Hosting and third-party link-preview caches require a deployment; none is claimed here.

Verified locally: JPEG dimensions 1200 × 630, size 499,815 bytes, and an unchanged copy in `dist/og/`.
`npm run build:pages` passed with HTML size 1,565,562 bytes, below the 1.5 MiB limit.
Four targeted Chromium/WebKit checks passed: hosted loading at project and custom-domain paths,
plus both engines' offline checks. The sharing image adds no request to the simulator's normal load.

## Exact generation prompt

```text
Use case: illustration-story
Asset type: Canteen Sim social-sharing Open Graph cover, wide landscape 1200 × 630 composition (1.905:1), with all essential artwork and text safely inside the central 90%.
Primary request: an exciting Japanese action manga illustration of adult office workers rushing into a lunch hall at the start of their lunch break. Energetic and funny.
Scene: a recognisable office canteen entrance opening onto long tables, chairs and food counters. The office workers are clearly rushing INTO the canteen. Use a dynamic three-quarter side view so both expressive faces and the destination are clear.
Subjects: a mixed group of adult male and female office workers in shirts, trousers or office skirts, loose ties and employee lanyards. Show three prominent runners and a smaller crowd following, with comic determination, flying ties and exaggerated but anatomically coherent running poses.
Style: original Japanese action manga, expressive faces, bold black ink brushwork, varied line weight, crisp screentones, strong foreshortening, dramatic diagonal speed lines, energetic cover composition. Mostly black ink on warm off-white paper, with restrained vermilion and muted teal spot colours. Illustrated, not photorealistic.
Typography: integrate a large, clear cover title into an uncluttered part of the composition. Exact title: "Canteen Sim". Exact Thai subtitle: "ศึกชิงโต๊ะพักเที่ยง". The Thai lettering must be correct, legible, looped and bold, similar to Noto Sans Thai Looped; keep vowels and tone marks distinct. Text should remain readable as a small social-sharing thumbnail. Use only those two text elements; no extra words, signatures or watermarks.
Composition: keep the visual focus on the comic lunch rush, with enough visible dining furniture to identify a lunch hall immediately. Clear silhouettes and a readable hierarchy between the title, workers and background. No decorative border, no separate panels, no speech balloons. Full-bleed opaque background.
Avoid: existing manga characters or logos, violence, weapons, extra limbs, malformed hands, clutter covering the title, scientific charts or claims.
```
