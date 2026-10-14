# Notes: what the plugin API allows

What we measured building this mod against Claude Code 2.1.299 in fullscreen (cmux, Ghostty, 194×66). The plugin API is early access, so check these again after an update.

## Writing the module

- `$` can't be stored or passed around. Spell it `$.noun.method()` inside the hook. A helper that takes `$` must be a top-level `function` declaration, in this file or one it imports. An arrow const or a closure inside `register` is refused.
- `$.state` refs (`atom({ plugin, key })`) must be declared with literals in the same file that reads or writes them, so each file declares its own atoms.
- Plugin names can't start with `claude-`, and `claude-mods` itself is reserved.
- `$.clock.after` returns a `Timer`; stop it with `.cancel()`.
- A test mounts drawings and raises events, but nothing sits beneath the plugin. The test answers every event and `$` call itself. `$`-call events (`fs.*`, `process.run`, `command.register`, `ui.blit`) answer `{ value }`; engine events answer their result directly.
- `/home/...` counts as a network location on macOS (autofs), so the `Image` file check refuses it. Use `/Users/...` in fixtures.

## Where a mod can draw

Spots a mod can draw into near the prompt:

| Site | Where | Notes |
| --- | --- | --- |
| `AbovePrompt` | band above the prompt | its own region |
| `SessionMode` | footer, right end | one row in the flow |
| `PromptHint` | hint line under the prompt | not used |
| conversation rows | `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `TurnDuration`, `InfoNotice` | each row is drawn in the conversation's region; `e.props.onScreen` says which of its lines are visible |

Nothing sits beside the prompt box, which always spans the full width.

## Floating boxes (`position: "absolute"`)

- A floating box is cut off at the edge of its site's region. The probes showed:
  - **Band:** its own region; nothing above or below it shows. To the right, it reaches into the `[-]` margin.
  - **Footer (`SessionMode`):** the bottom area: the separator lines, the prompt input and the footer rows, at least 5 rows up from the footer label. 12 rows up is cut off.
  - **Conversation row:** the whole conversation area.
- **A site that draws nothing in the flow isn't laid out at all,** so a floating box hung off it never shows. Give the site some visible content in place.
- **Images aren't dropped at the edge.** A 5- or 6-row `Image` crossing the footer region's rows still drew.
- **Floating boxes paint over what came *before* them in the tree, not after.** A pet hung off one conversation row is covered by every later row's text, so the pet needs the bottom-most row as its host.
- **Engine bug:** a box that is cut off still stops the cells under it from repainting, which leaves stale text behind (seen as `Churnereloaded`, and a leftover box of old text where the pet would have been).
- Floating content over the prompt hides what you type underneath it.

## The mouse

- **The pointer over a floating box lands on its parent.** A `Client` inside a floating box never gets mouse events, so the pet itself can't be grabbed.
- A `Client` drawn in the flow does get events (`down`, `move`, `up`, with sub-cell `fine` positions on Ghostty). After a `down` it keeps every `move` until the `up`, even off its own cells, and no text gets selected. The pet's name tag in the footer is the drag handle for this reason.
- Ghostty reports moves within a cell, so only send an update when the cell changes, or each one costs a full redraw.

## Conversation rows as a host

- A hook can wrap a row the engine draws: `next(e)` returns `{ type: 'engine', ref }`, which can go inside the hook's own tree.
- `onScreen` is `{ first, last, of }` in the row's own lines; it's `null` once the row is off screen. Rows report again whenever they cross a viewport edge.
- The conversation's height isn't given anywhere. The band's `maxRows` is what the bottom slot (capped at half the terminal) has left above the prompt, so the prompt and footer take `floor(rows / 2) - maxRows` rows.

## Codex pet behaviour

From Codex's `hatch-pet` skill:

- An atlas is 8×9 cells of 192×208, one animation per row.
- Idle loops continuously; its first frame is the still pet for reduced motion.
- `running-left` / `running-right` play while the pet is dragged.
