# pets

A pet that lives above the Claude Code prompt and reacts to what Claude is doing.

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

## Commands

- `/pet` or `/pet list`: the pets found, current one marked
- `/pet <id>`: switch pets (remembered across sessions)
- `/pet off` / `/pet on`: hide or show the pet
- `/pet home`: put the pet back in its corner

## Placement

In fullscreen the pet floats over the conversation, starting at its bottom-right. Its name tag sits in the footer at the bottom right; drag the name tag to move the pet anywhere over the conversation. The position is remembered. A floating box never receives the mouse, so the name tag is the handle rather than the pet itself.

`/config` options:

- `placement`: `float` (default) or `band`, the pet in its own rows above the prompt, right-aligned
- `size`: the pet's height in terminal rows (default 4)

## Requirements

- A terminal with the kitty graphics protocol (Ghostty, kitty). Elsewhere the pet shows as its name.
- [ImageMagick](https://imagemagick.org) or [ffmpeg](https://ffmpeg.org), used once per pet to slice the spritesheet into frames, cached in `~/.claude/cache/app.paulie.claude-mods.pets/`. Your pet folders are never changed.
