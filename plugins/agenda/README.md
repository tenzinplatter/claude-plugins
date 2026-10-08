# agenda

A pane with two modes:

- **focus**: full-width `claude`-coloured header bar and heavy rule. Headed by the arc story for the current branch, or the current git repo when there is no story. Lists Claude's own tasks (mirrored live from `TaskCreate`/`TaskUpdate`/`TodoWrite`, in-progress first), then todos added in this session, the story note's todos, and the rest of this repo's todos.
- **overview**: quiet muted header and thin rule. Shows every open arc todo grouped by when it's due (overdue, today, this week, later, someday), then by repo, or by a shared `project:` prefix for todos outside any repo.

It opens in focus when the branch resolves to a story, and in overview otherwise.

## Commands

| | |
| --- | --- |
| `/agenda` | toggle the pane |
| `/agenda focus` / `/agenda overview` | open in that mode |
| `/agenda add <text> [@YYYY-MM-DD]` | add a manual todo |
| `/agenda refresh` | re-read arc |

In the pane, titles wrap in full and the pane scrolls; click a title to expand its details, and click its `▢`/`○` to complete it. Press `f`/`o` to switch modes and `r` to refresh.

## Settings

`dockColumns` (in `/config`, default 40): the width the pane asks for when docked beside the transcript. Dragging the dock to another width wins.

## Requires

`arc` on `PATH` with repo-scoped todos (`arc todo list` printing `{ repo, todos }`). `/agenda add` and Claude's `add_todo` calls through arc's MCP server are tagged with this session and scoped to the session's repo. The pane refreshes every minute while open, and after Bash and `mcp__arc__*` tool calls.
