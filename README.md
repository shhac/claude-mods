# claude-mods

Mods for [Claude Code](https://claude.com/claude-code): changes to its interface and behaviour, built on function hooks.

| Mod | What it does |
| --- | --- |
| [pets](plugins/pets) | A Codex-compatible pet above the prompt that reacts to what Claude is doing |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pets --marketplace shhac/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```sh
claude plugin install pets --marketplace shhac/claude-mods
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

## License

MIT
