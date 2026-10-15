# claude-mods

Mods for [Claude Code](https://claude.com/claude-code): changes to its interface and behaviour, built on function hooks.

| Mod | What it does |
| --- | --- |
| [pets](plugins/pets) | A Codex-compatible pet that floats over the conversation, reacts to what Claude is doing, chats a little and grows as you work |

## Requirements

- Claude Code 2.1.287 or later, in the terminal. Mods are plugins made of function hooks; the API is early access, so a Claude Code update can change what a mod can do.
- Each mod's README lists anything else it needs (pets needs a terminal with the kitty graphics protocol, such as Ghostty or kitty).

## Add a mod to Claude Code

This repo is a plugin marketplace named `shhac-claude-mods`. Each mod installs as a plugin from it.

### One step

At the prompt of a Claude Code terminal session:

```
/plugin install pets --marketplace shhac/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```sh
claude plugin install pets --marketplace shhac/claude-mods
```

### Add the marketplace, then pick mods

```
/plugin marketplace add shhac/claude-mods
/plugin install pets@shhac-claude-mods
```

`/plugin` on its own lists the marketplace's mods to browse and install.

### Scope

A mod installs for you alone by default (`user`, every project). Pass `--scope project` to share it with everyone on a repository through its `.claude/settings.json`, or `--scope local` for just you in that one repository.

### After installing

The mod loads in your next session. Its options are under `/config`, or from a shell:

```sh
claude plugin configure pets
```

## Update, disable or remove

```sh
claude plugin marketplace update shhac-claude-mods
claude plugin update pets@shhac-claude-mods

claude plugin disable pets@shhac-claude-mods
claude plugin uninstall pets@shhac-claude-mods
```

## Try a mod without installing it

Clone the repo and start a session with the mod's folder loaded:

```sh
git clone https://github.com/shhac/claude-mods.git
claude --plugin-dir claude-mods/plugins/pets
```

## Developing

Run a mod from its folder; saving a file hot-reloads it:

```sh
claude --plugin-dir plugins/pets
```

Check it before you commit:

```sh
claude plugin validate plugins/pets
claude plugin test plugins/pets
```

Each mod's `NOTES.md`, where it has one, records what we've learned about the plugin API while building it.

## License

MIT
