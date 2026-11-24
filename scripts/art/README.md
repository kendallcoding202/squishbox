# The art

Every dumpling, basket, place and prop in the game is a painting generated with the OpenAI
image API and kept in `src/art/` as small WebP files. The game finds them by name
(`src/ui/art.ts`) and falls back to its old SVG and emoji drawings for anything without one,
so a new character can be added before its painting exists. `tests/art.test.ts` fails until
it does, so nothing ships half drawn.

## Making or remaking pictures

```sh
node scripts/art/build-jobs.mjs                  # prompts for everything, from the game's own data
python3 scripts/art/generate.py                  # makes whatever is missing in art-work/raw/
python3 scripts/art/generate.py --only dumplings/c07 boxes/sleigh   # remake particular ones
npm install --no-save sharp && node scripts/art/finish.mjs           # trim, size, write src/art/
```

- **The look lives in `spec.mjs`.** A dumpling's prompt is built from its entry in
  `src/data/characters.ts` (colour, shape, face, hat, pattern, the line on its card), plus a
  hand-written note for the ones that are not a plain bao (shumai, har gow, egg tart and so on).
- **The style lives in `reference/`.** Every dumpling and basket is drawn against
  `dumpling.png`, every place and prop against `scenery.png`. Keep these; changing them changes
  the whole family.
- `art-work/` is scratch space and is not committed. Raw pictures are about 1 MB each.
- Look at every new picture before committing it. The model is good, not perfect: check the
  face, the hat and the colour against the character's card.

The key comes from `OPENAI_API_KEY`, or from the network proxy in a Claude cloud session.
Pictures were made with `gpt-image-2.6-sunburst` at `high` quality.
