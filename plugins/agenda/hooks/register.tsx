import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArcSnapshot, ClaudeTask, Mode } from '../types'
import { applyTaskCall, localDate, parseAddArgs, toggled, type TaskCall } from './agenda'
import { CONTEXT_ARGV, INSTALL_HINT, LIST_ARGV, addArgv, doneArgv, failure, snapshotFrom } from './arc'
import { FocusView, OverviewView, type Actions, type RowEnv } from './views'

const PANE = 'agenda'
const REFRESH_MS = 60_000
const ARC_TIMEOUT_MS = 15_000
const USAGE = 'Usage: /agenda [focus | overview | refresh | add <text> [@YYYY-MM-DD]]'

const mode = atom({ plugin: 'agenda', key: 'mode' } as const, null as Mode | null)
const tasks = atom({ plugin: 'agenda', key: 'tasks' } as const, [] as ClaudeTask[])
const arc = atom({ plugin: 'agenda', key: 'arc' } as const, { kind: 'loading' } as ArcSnapshot)
const expanded = atom({ plugin: 'agenda', key: 'expanded' } as const, [] as string[])

async function isOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function runArc($: EngineInterface, argv: readonly string[]) {
  return $.process.run(argv, { timeoutMs: ARC_TIMEOUT_MS }).catch(() => {
    throw new Error(INSTALL_HINT)
  })
}

async function writeArc($: EngineInterface, argv: readonly string[]): Promise<void> {
  const failed = failure(argv, await runArc($, argv))
  if (failed !== null) throw new Error(failed)
}

async function loadArc($: EngineInterface): Promise<ArcSnapshot> {
  try {
    const [context, todos] = await Promise.all([runArc($, CONTEXT_ARGV), runArc($, LIST_ARGV)])
    return snapshotFrom(context, todos)
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

async function refresh($: EngineInterface): Promise<void> {
  const snapshot = await loadArc($)
  await update($, arc, () => snapshot)
}

async function refreshIfOpen($: EngineInterface): Promise<void> {
  if (await isOpen($)) await refresh($)
}

async function show($: EngineInterface, next: Mode | null): Promise<void> {
  if (next !== null) await update($, mode, () => next)
  await $.ui.open({ id: PANE, title: 'Agenda' })
  await refresh($)
}

async function trackTasks($: EngineInterface, call: TaskCall): Promise<void> {
  await update($, tasks, list => applyTaskCall(list, call))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agenda',
      description: 'Toggle the agenda pane, or switch it to focus / overview',
      argumentHint: '[focus | overview | refresh | add <text> [@YYYY-MM-DD]]',
      immediate: true,
    })
    $.clock.every(REFRESH_MS, () => void refreshIfOpen($))
    void refreshIfOpen($)
    return next(e)
  })

  on('command.run', { command: 'agenda' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    switch (verb) {
      case '':
        if (await isOpen($)) {
          await $.ui.close({ id: PANE })
          return { text: 'Agenda closed.' }
        }
        await show($, null)
        return { text: 'Agenda opened.' }
      case 'focus':
      case 'overview':
        await show($, verb)
        return { text: `Agenda: ${verb}.` }
      case 'refresh':
        await refresh($)
        return { text: 'Agenda refreshed.' }
      case 'add': {
        const parsed = parseAddArgs(rest.join(' '))
        if (parsed === null) return { text: USAGE }
        await writeArc($, addArgv(parsed.text, parsed.date))
        await refreshIfOpen($)
        return { text: `Added: ${parsed.text}${parsed.date === null ? '' : ` (due ${parsed.date})`}` }
      }
      default:
        return { text: USAGE }
    }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await trackTasks($, { tool: 'TodoWrite', todos: ran.result.newTodos })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await trackTasks($, { tool: 'TaskCreate', id: ran.result.task.id, subject: ran.result.task.subject, detail: e.description })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true && ran.result.success) {
      await trackTasks($, { tool: 'TaskUpdate', id: e.taskId, subject: e.subject, detail: e.description, status: e.status })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash' || String(e.tool).startsWith('mcp__arc__')) void refreshIfOpen($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const ui = { Box, Text, Button }
    const snapshot = await read($, arc)
    const chosen = await read($, mode)
    const shown: Mode = chosen ?? (snapshot.kind === 'loaded' && snapshot.context !== null ? 'focus' : 'overview')
    const actions: Actions = {
      complete: async id => {
        await writeArc($, doneArgv(id)).catch(error => $.ui.toast(`agenda: ${error instanceof Error ? error.message : error}`))
        await refresh($)
      },
      toggle: key => update($, expanded, keys => toggled(keys, key)).then(() => undefined),
      switchTo: next => update($, mode, () => next).then(() => undefined),
      refresh: () => refresh($),
    }
    const row: RowEnv = {
      ui,
      actions,
      open: await read($, expanded),
      columns: e.props.bodyColumns,
      today: localDate(await $.clock.now()),
    }
    if (shown === 'focus') return <FocusView row={row} arc={snapshot} tasks={await read($, tasks)} />
    return <OverviewView row={row} arc={snapshot} />
  })
}
