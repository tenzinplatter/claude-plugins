# claude-plugins

Personal Claude Code plugins, published as a marketplace.

| Plugin | What it does |
| --- | --- |
| [agenda](plugins/agenda) | Toggleable todo/agenda pane backed by [arc](https://github.com/tenzinplatter/arc) |

## Install

```
/plugin install agenda --marketplace <owner>/claude-plugins
```

## Develop

```
claude --plugin-dir ~/code/claude-plugins/plugins/agenda   # loads from disk, hot-reloads on save
claude plugin validate plugins/agenda
claude plugin test plugins/agenda
```
