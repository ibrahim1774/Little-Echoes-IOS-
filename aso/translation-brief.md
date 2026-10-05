# Translation brief — Little Echoes App Store listing

Source: `fastlane/metadata/en-US/*.txt` (name, subtitle, keywords, promotional_text, description).
Output: `fastlane/metadata/<locale>/<same five files>.txt`, UTF-8, no trailing newline in
name/subtitle/keywords/promotional_text.

## What the app is

A parent asks their child (ages 1–12) one question a day and records the child's spoken
answer. Recordings build a private timeline ("memory book") of how the child's voice
sounds at every age. Pro adds short video clips. Audience: parents. Tone: warm, simple,
not cutesy.

## Hard character limits (count Unicode characters, per locale)

| field | limit |
| --- | --- |
| name | 30 |
| subtitle | 30 |
| keywords | 100 |
| promotional_text | 170 |
| description | 4000 |

If a translation is over a limit, rephrase it shorter. Never truncate mid-word.

## Brand structure

- **BrandWord:** `Little Echoes`.
  - Latin-script locales: keep `Little Echoes` exactly.
  - Non-Latin scripts (Cyrillic, Greek, Arabic, Hebrew, Thai, CJK, Indic): transliterate
    it into the local script (e.g. ja `リトルエコーズ`, ru `Литл Экоуз`).
- **DescriptorWord:** `Baby Journal`. This is search vocabulary: use the term parents in
  that market actually type for an app that records memories of their baby or young child
  (e.g. de `Babytagebuch`, fr `Journal de bébé`, es `Diario del bebé`).
- **Name format:** `<Descriptor>: <Brand>`, descriptor first, at most 30 characters. If it
  doesn't fit, shorten the descriptor; never drop the brand.

## Subtitle

The source is `Kids Voice Diary & Memory Book`. Keep both concepts, the children's voice
diary and the memory book, using locally searched words. Maximum 30 characters. If both
don't fit, keep "voice diary for kids" first.

## Keywords field

- Adapt the en-US concept list; never invent new concepts or add country names.
- The concepts are: toddler, child, family memories, milestones, keepsake, audio
  recorder, first words, quotes (the funny things kids say), time capsule.
- Comma-separated, no spaces after commas, at most 100 characters.
- Do not repeat words already used in that locale's name or subtitle.
- If space remains after all concepts fit, add the local word for "kids/children" or
  "voice recording" only if it isn't already in the name or subtitle.
- For CJK and Thai, words are short: use the full concept list.

## Description and promotional text

- Translate by meaning, not word for word. Idioms such as "grow up fast" and "the little
  things" get natural local phrasing.
- Keep the structure: the paragraphs, the three ALL-CAPS section headings (in scripts with
  case; elsewhere a plain heading line) and the "•" bullets.
- "spaghetti" in quotes is an example of a word a small child mispronounces. Replace it
  with a word that is natural in that language and that children commonly mispronounce,
  keeping it in quotes.
- "(Pro)" stays as `(Pro)`.

## Verbatim atoms — must appear byte-identical

- `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
- `iPhone`
- `Pro`
- `3`, `5`, `12` (numerals; the age references)

## Forbidden

- No prices, no "free", no "trial", no discounts anywhere.
- No Apple product names in the name or subtitle.
- Never leave a field in English (except in the en-* locales).
