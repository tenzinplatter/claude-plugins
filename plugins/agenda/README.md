# agenda

A pane with two modes:

- **focus**: heavy `claude`-coloured frame. Shows the arc story for the current branch, the `Next` from its latest handoff, Claude's own tasks (mirrored live from `TaskCreate`/`TaskUpdate`/`TodoWrite`, in-progress first) and then the story note's open todos.
- **overview**: quiet rounded frame. Shows every open arc todo grouped by when it's due: overdue, today, this week, later, someday.

It opens in focus when the branch resolves to a story, and in overview otherwise.

## Commands

| | |
| --- | --- |
| `/agenda` | toggle the pane |
| `/agenda focus` / `/agenda overview` | open in that mode |
| `/agenda add <text> [@YYYY-MM-DD]` | add a manual todo |
| `/agenda refresh` | re-read arc |

In the pane, click a row to expand its full text and details, and click its `▢`/`○` to complete it. Press `f`/`o` to switch modes and `r` to refresh.

## Requires

`arc` on `PATH` with the `todo` subcommands (`arc todo list|add|done`). The pane refreshes every minute while open, and after Bash and `mcp__arc__*` tool calls.
