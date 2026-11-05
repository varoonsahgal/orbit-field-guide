# ORBIT Field Academy — student site

Live: https://varoonsahgal.github.io/orbit-field-guide/

Hands-on Amazon Bedrock AgentCore missions, run entirely in the AWS Console, published as a GitHub Pages site. The main flight path is Missions 03–08; Missions 01–02 are an optional **pre-flight** track on AWS foundations. Each mission page is the student handout (use **Print handout** for paper or PDF). The original one-page field guide is kept as `field-guide.html` (the "Quick ref" link).

| Page | Source |
|---|---|
| `index.html` | mission control: hero + status console, flight path, mission cards, pre-flight track, skills constellation, architecture, before-you-start |
| `mission-NN.html` | `student-labs/NN-ORBIT-*.md` (any number; picked up automatically) |
| `notes.html`, `notes-NN.html` | `student-labs/companionguides/NN-companion.md` |
| `field-guide.html` | hand-written one-page quick reference (not generated; own styles) |
| `img/*.webp` | `student-labs/images/*.png`, only the ones the pages reference |
| `assets/site.css`, `assets/site.js`, `assets/diagrams.js` | design system, interactions, Mermaid theming (vanilla, no build step) |

## Rebuild

The lab markdown lives in the private `orbit-field-academy-student-labs` repository. Clone it next to this repo (or point `LABS_DIR` at it), then:

```bash
cd tools
npm install
node build.mjs                                   # LABS_DIR defaults to ../../student-labs
LABS_DIR=/path/to/student-labs node build.mjs    # or point it anywhere
STRICT_IMAGES=1 node build.mjs                   # also fail if a referenced image is missing
```

Requirements: Node 18+ and `cwebp` (`brew install webp`). The generator rewrites the HTML pages and `img/` in place, and deletes a `mission-NN.html` / `notes-NN.html` whose markdown no longer exists; commit the result and push to `main`.

## Public-safety sanitization

This repository is public; the source labs are not. `tools/build.mjs` rewrites private values, then checks every generated page (and `field-guide.html`) and **fails the build without writing anything** if one survives:

| Private value | Published as |
|---|---|
| training account ID | `111122223333` |
| shared Cognito pool ID | `us-west-2_EXAMPLE` |
| shared Cognito app client ID | `EXAMPLECLIENTID` |
| shared Cognito domain prefix | `orbit-academy-xxxxx` |
| recruit passwords | "the temporary password your instructor gives you" |

Screenshots are copied as captured, so the training account ID is still visible in the console header of some images. The text sanitizer cannot see inside images; check new screenshots by eye for pool IDs, client IDs and access keys.

## Mission ID personalizer

Students click **Set your ID** (top bar) and enter their `MY_ID` and, optionally, their 12-digit account ID. Both are stored in `localStorage` (`orbit:myid`, `orbit:acct`; theme in `orbit:theme`; checkboxes in `orbit:chk:<page>:<n>`; earned patches in `orbit:award:<page>`). Every literal `MY_ID` and `111122223333` in the page text, tables, code blocks and Mermaid diagrams is replaced with their values, so copy buttons copy commands with their real resource names. To print the placeholder itself, put a zero-width space inside it (`MY​_ID`).

## Adding a mission (07, 08, …)

1. Drop `NN-ORBIT-Anything.md` into `student-labs/` and rebuild. Nothing else is required: the page, nav entry, flight-path node, mission card, skills column and prev/next links appear automatically. Until the file exists, the mission shows as **In preparation** using the `soon` placeholder metadata in `REGISTRY` (top of `tools/build.mjs`), and the build still passes.
2. Presentation metadata lives in `REGISTRY` in `tools/build.mjs`: `hue`/`hue2` (mission colour), `tag` (short label), `module` (eyebrow), `track` (`'foundation'` puts it in the pre-flight track; anything else is the main flight path), `emblem` (patch artwork: `globe`, `flame`, `key`, `rocket`, `shield`, `radar`, `breach`, `crew`, `star`) and `skills` (the constellation and card chips). 07 (Hull Breach, red, `breach`) and 08 (crew, amber, `crew`) are already registered. A number missing from `REGISTRY` still builds, with a fallback colour and a star emblem.
3. The markdown header drives the masthead and its gauges — keep this exact shape:

```markdown
# 🛰️ ORBIT FIELD ACADEMY
## MISSION 07 · HULL BREACH
### One-line subtitle shown under the title and on the mission card

> **LEVEL:** Red Team · **TARGET TIME:** 150–180 minutes · **ENVIRONMENT:** AWS Management Console only
> **THE STORY:** One paragraph of story.
> **SKILLS:** Leaky system-prompt secrets · Indirect prompt injection · Poisoned tool descriptions
```

- The name after `·` on line 2 becomes the page title, nav label and patch text (keep it short: it is set around the patch rim).
- **LEVEL** feeds the level gauge. Known ranks: Recruit 1, Discovery 2, Builder 3, Security Engineer 4, Flight Director 5, Red Team 5, Mission Commander 6 (`LEVEL_RANK`); other names fall back to a rank from the mission number.
- **TARGET TIME** must contain `NN–NN` (or one number) in minutes; it drives the time dial and the landing-page hours total.
- **SKILLS** (optional, ` · `-separated) overrides the `REGISTRY` skills; 4–5 short items read best.

## Markdown the generator expects

- Phases are `## <emoji> Phase N — Title (X minutes)`; they get short anchors `#phase-N`, a large outlined phase numeral, numbered TOC entries and a dot on the sticky **phase stepper**. Other `##` headings become plain TOC entries.
- `**🧩 Investigation checkpoint**` (any bold paragraph containing "checkpoint") immediately followed by a `- [ ]` list becomes a checkpoint card with a live `n/total` counter; every `- [ ]` item is a saved checkbox. Checkboxes feed the progress rings, the per-phase stepper fill, the skills constellation, and the **patch award** (confetti + patch dialog) when the last box on a page is ticked.
- GitHub alerts `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` become callouts (leave a blank line between two alerts, and after an alert before normal text, or they merge). Other blockquotes become pull quotes.
- Learning cues: a paragraph starting `**Expected:**` (or `**Expected** (…):`) becomes a green check badge (the success criterion of a step); a paragraph starting `**What you just proved:**` becomes a gold box; `**Predict first:**` anywhere becomes a violet pill. Reveals whose summary mentions *answer*, *solution*, *compare* or *red flags* get the Answer badge; put spoilers (verification-run results) in `<details><summary>✅ Compare with the verification run (open after …)</summary>` with blank lines around the markdown inside.
- `<details><summary>…</summary>` becomes a reveal ("hint" or "answer"/"solution" in the summary sets the badge).
- Images must be `![alt](images/name.png)` on their own line; they become framed, numbered figures (`Fig 04.07`) with the alt text as caption, lazy-loaded with intrinsic width/height, and open in a lightbox gallery (arrow keys / swipe, click for actual size).
- ```` ```mermaid ```` renders client-side. A code fence with no language whose first lines start with `fields`/`filter`/`stats` is labelled "Logs Insights".
- Companion notes: `# PART …` headings become part dividers; `## ❓ NN. Question` headings become numbered question cards with a filter box.
- A small glossary in `assets/site.js` (`GLOSSARY`) adds a hover/focus definition to the first use of terms like AgentCore, Harness, Gateway, MCP, JWT, Cedar on each page. Add terms there.
