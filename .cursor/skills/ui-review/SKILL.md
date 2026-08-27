---
name: ui-review
description: Reviews Wings of Athena UI from a campaign manager perspective using the running app and Cursor Browser on desktop and mobile. Use when reviewing UX, navigation, forms, states, labels, hierarchy, or mobile layout before or after UI changes.
---

# UI Review

Review Wings of Athena from the perspective of a campaign manager, not a developer.

Run the application and use Cursor Browser.

Read `AGENTS.md` and `.cursor/rules/architecture.mdc` before reviewing. The user is a campaign manager, mid-race, under time pressure, often on a phone, frequently not a data person. She opens Wings with a question and wants it answered in under ten seconds.

## Review

- desktop
- mobile
- major navigation
- forms
- empty states
- error states
- loading states

Judge whether a campaign manager can understand:

- what they are looking at
- what action they should take
- what the numbers mean
- what requires attention

Look for:

- unnecessary technical language
- excessive information
- unclear labels
- weak hierarchy
- duplicated actions
- confusing navigation
- inaccessible controls
- mobile layout problems

Do not redesign the application automatically.
Report findings first unless explicitly asked to make changes.

## Setup

```bash
npm run dev
```

Use browser MCP (`cursor-ide-browser`):

1. `browser_tabs` → list open tabs
2. `browser_navigate` → app URL (typically `http://localhost:5173`)
3. `browser_lock` → before extended review
4. `browser_snapshot` → accessibility tree for each screen/state
5. `browser_take_screenshot` → visual evidence for layout issues
6. `browser_unlock` → when finished

Workflow: navigate → lock → snapshot/screenshot → interact → unlock.

## Screens to cover

Primary flow (implemented):

- Campaign Setup
- Path to Victory
- Program & Budget
- Adopt Plan

Not yet implemented — note if linked or referenced but missing:

- Command Center
- Reforecast

Also check supporting surfaces reachable from primary screens: scenario switching, field guides, feasibility acknowledgments, adoption errors.

## Desktop review

At default viewport:

- Walk major navigation end-to-end
- On each screen, answer the four manager questions (what / action / numbers / attention)
- Check progressive disclosure: Level 1 = answer only; Level 2 = cause in plain English; Level 3 = audit (formulas, keys, versions)
- Flag Level 3 content appearing at Level 1 or 2
- Verify status dots: ON TRACK (green), WATCH (amber), AT RISK (red), NO DATA (hollow gray ring — never green or filled)
- Check tabular number alignment and visual hierarchy (answer before detail)

## Mobile review

Primary layout is 390px, not an afterthought. Resize or emulate ~390px width.

Check:

- Single-column cards, no horizontal overflow
- Full-width buttons with 44px minimum touch target
- Metadata stacked, long text wrapped
- Navigation reachable without precision tapping
- Forms usable one-handed
- Status and primary action visible without excessive scrolling

## State coverage

For each major screen, attempt to observe:

| State | What to check |
|-------|----------------|
| Empty | Clear next step; no dead ends or unexplained blanks |
| Loading | Obvious progress; no misleading partial data |
| Error | Plain-language cause and recovery action; no raw error codes at Level 1 |
| Populated | Answer visible quickly; attention items stand out |

To trigger states, use empty local storage, incomplete drafts, invalid inputs, or adoption blockers as appropriate. Do not modify production data.

## Findings format

Report only — do not change code unless explicitly asked.

```markdown
## UI review report

### Scope
- URL / branch / date
- Viewports tested: desktop, 390px mobile

### Summary
[2–3 sentences: overall manager usability verdict]

### Critical (blocks understanding or action)
- [Screen] — [finding] — [why it matters to a manager]

### Major (confusing but workable)
- …

### Minor (polish / hierarchy)
- …

### Progressive disclosure violations
- [Level 3 content shown at Level 1/2]

### Mobile-specific
- …

### What works well
- …

### Screens not reviewed / blocked
- [reason: not implemented, could not trigger state, auth required, etc.]
```

Severity guide:

- **Critical** — manager cannot tell what to do, misreads status, or hits a dead end
- **Major** — understandable with effort; technical language, weak hierarchy, or duplicated actions
- **Minor** — spacing, label wording, non-blocking layout quirks

## Wings-specific red flags

- Metric keys, formula IDs, engine versions, or assumption keys above Level 3
- Health scores, gauges, percentages as composite status, celebration states
- Math shown as formulas instead of sentences at Level 2
- NO DATA displayed as on-track or performance-positive
- Competing primary destinations beyond the six-screen model
- Horizontal scroll, animated counting numbers, or touch targets under 44px on mobile

## After reporting

- Do not implement fixes unless the user explicitly asks
- If asked to fix, use the `ship-feature` skill for implementation
- Do not commit or push unless explicitly requested
