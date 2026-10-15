# pets

A pet that floats over your Claude Code conversation, reacts to what Claude is doing, chats a little, and grows as you work together.

Pets use the **Codex pet format**, so the pets you already have in Codex show up here unchanged, and a pet made for one works in both.

## Install

```
/plugin install pets --marketplace shhac/claude-mods
```

See the [repo README](../../README.md) for scopes, updating and removing.

## What it shows

| Claude is… | The pet plays | Label |
| --- | --- | --- |
| idle | `idle` | Ready |
| working (edits, shell, agents) | `running` | Running · tool |
| reading or searching | `review` | Reviewing · tool |
| waiting on you (permission, a question, a plan) | `waiting` | Needs input |
| finished a turn | `jumping` | Done! |
| being dragged | `running-left` / `running-right` | |
| hit an error | `failed` | Blocked |
| starting a session, or a new pet | `waving` | Hello! |
| petted, fed, or levelling up | `jumping` | ♥ / Level up! |

## Pets

Pets are read from two folders, same format in both:

- `~/.claude/pets/<id>/`
- `$CODEX_HOME/pets/<id>/` (default `~/.codex/pets/<id>/`)

A pet folder holds a `pet.json` and its spritesheet:

```json
{
  "id": "dawnbyte",
  "displayName": "Dawnbyte",
  "description": "One short sentence.",
  "spritesheetPath": "spritesheet.webp"
}
```

The spritesheet is Codex's atlas: a 1536×1872 PNG or WebP, 8 columns × 9 rows of 192×208 cells, one animation per row (idle, running-right, running-left, waving, jumping, failed, waiting, running, review). Codex's `hatch-pet` skill and [Petdex](https://petdex.dev) both make pets in this format.

Until you pick one, you get the pet Codex is set to (`pet = "custom:<id>"` in `~/.codex/config.toml`).

## Playing with it

In fullscreen the pet floats over the conversation, starting at its bottom-right corner.

| Do this to the pet | It does |
| --- | --- |
| drag it | moves anywhere over the conversation (remembered) |
| click | it likes being petted |
| double click | hops onto the right end of the prompt box, or back |
| right click | small → medium → large |

The name tag in the footer (bottom right) works too: drag it and the pet follows the pointer, double click to dock it, right click to resize. If grabbing the pet ever misses, the tag always works.

The pet can go right down to the bottom of the conversation, over the notices Claude Code prints there (a reload, a recap, a drafted bug report). No hook sees those rows, so there the pet can only be grabbed by its name tag, and a notice's text draws over it.

## Chatter

The pet says how it feels about what's going on: not what Claude is doing, which the conversation already shows. Haiku speaks for it, told who the pet is (its name, its Codex description, its mood and level), what you asked, what Claude has done since and what the pet said already. It has a feeling about a tool call at most every 12 seconds, asks the model at most every 20, and fills in between with lines of its own. While Claude goes quiet to think, the pet muses in a thought bubble. When a reply lands it makes a cute, slightly snarky remark about it.

Set `chatter` to `quiet` for the pet's own lines with no model calls, or `off` for no bubble.

## Looking after it

The pet levels up as it watches you work (replies and tool calls earn xp), likes being petted and fed, and keeps a streak of the days you visit. Its mood drifts down a little while you're away but never drops below a floor, and failures only dent it. The footer shows its level and mood hearts: `Dawnbyte Lv3 ♥♥♥♥♡`. Each pet keeps its own stats.

## Commands

- `/pet` or `/pet list`: the pets found, current one marked
- `/pet <id>`: switch pets (remembered across sessions)
- `/pet off` / `/pet on`: hide or show the pet
- `/pet home`: back to its corner over the conversation
- `/pet size [small|medium|large]`: set the size, or cycle it
- `/pet dock`: over the prompt box, or back over the conversation
- `/pet stats`: level, mood, streak and what it has watched
- `/pet feed`: a treat, at most every half hour
- `/pet pat`: pet it from the keyboard

## Options

In `/config`:

- `placement`: `float` (default), over the conversation or the prompt box; or `band`, the pet in its own rows above the prompt, right-aligned
- `size`: the starting size, `small` (3 rows), `medium` (4, default) or `large` (6)
- `chatter`: `on` (default), `quiet` or `off`

## Requirements

- A terminal with the kitty graphics protocol (Ghostty, kitty). Elsewhere the pet shows as its name.
- Fullscreen mode and mouse clicks on (not `CLAUDE_CODE_DISABLE_MOUSE_CLICKS`) for dragging and clicking.
- [ImageMagick](https://imagemagick.org) or [ffmpeg](https://ffmpeg.org), used once per pet to slice the spritesheet into frames, cached in `~/.claude/cache/app.paulie.claude-mods.pets/`. Your pet folders are never changed.
