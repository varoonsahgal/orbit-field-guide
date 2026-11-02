# ORBIT Field Academy — student site

Live: https://varoonsahgal.github.io/orbit-field-guide/

Six hands-on Amazon Bedrock AgentCore missions, run entirely in the AWS Console, published as a GitHub Pages site. Each mission page is the student handout (use **Print handout** for paper or PDF). The original one-page field guide is kept as `field-guide.html` (the "Quick ref" link).

| Page | Source |
|---|---|
| `index.html` | mission control: flight plan, architecture, before-you-start, mission ID setup |
| `mission-01.html` … `mission-06.html` | `student-labs/0N-ORBIT-*.md` |
| `notes.html`, `notes-0N.html` | `student-labs/companionguides/0N-companion.md` |
| `field-guide.html` | hand-written one-page quick reference (not generated) |
| `img/*.webp` | `student-labs/images/*.png`, only the ones the pages reference |

## Rebuild

The lab markdown lives in the private `orbit-field-academy-student-labs` repository. Clone it next to this repo (or point `LABS_DIR` at it), then:

```bash
cd tools
npm install
node build.mjs                                   # LABS_DIR defaults to ../../student-labs
LABS_DIR=/path/to/student-labs node build.mjs    # or point it anywhere
```

Requirements: Node 18+ and `cwebp` (`brew install webp`). The generator rewrites the HTML pages and `img/` in place; commit the result and push to `main`.

## Public-safety sanitization

This repository is public; the source labs are not. `tools/build.mjs` rewrites private values before writing any page and **fails the build** if one survives:

| Private value | Published as |
|---|---|
| training account ID | `111122223333` |
| shared Cognito pool ID | `us-west-2_EXAMPLE` |
| shared Cognito app client ID | `EXAMPLECLIENTID` |
| shared Cognito domain prefix | `orbit-academy-xxxxx` |
| recruit passwords | "the temporary password your instructor gives you" |

Screenshots are copied as captured, so the training account ID is still visible in the console header of some images.

## Mission ID personalizer

Students click **Set your ID** (top bar) and enter their `MY_ID` and, optionally, their 12-digit account ID. Both are stored in `localStorage`. Every literal `MY_ID` and `111122223333` in the page text, tables, code blocks and Mermaid diagrams is replaced with their values, so copy buttons copy commands with their real resource names.

## Markdown the generator expects

- Line 1 `# 🛰️ ORBIT FIELD ACADEMY`, line 2 `## MISSION 0N · NAME`, line 3 `### subtitle`.
- Then a blockquote with `> **LEVEL:** … · **TARGET TIME:** … · **ENVIRONMENT:** …` and `> **THE STORY:** …` (companion notes use a free-form blockquote instead).
- Phases are `## <emoji> Phase N — Title (X minutes)`; they get short anchors `#phase-N` and numbered TOC entries. Other `##` headings become plain TOC entries.
- `**🧩 Investigation checkpoint**` (any bold paragraph containing "checkpoint") immediately followed by a `- [ ]` list becomes a checkpoint card; every `- [ ]` item is a saved checkbox that feeds mission progress.
- GitHub alerts `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` become callouts. Other blockquotes become pull quotes.
- `<details><summary>…</summary>` becomes a reveal ("hint" or "answer"/"solution" in the summary sets the badge).
- Images must be `![alt](images/name.png)`; the alt text becomes the caption.
- ```` ```mermaid ```` renders client-side. A code fence with no language whose first lines start with `fields`/`filter`/`stats` is labelled "Logs Insights".
- Companion notes: `# PART …` headings become part dividers; `## ❓ NN. Question` headings become numbered question cards with a filter box.
