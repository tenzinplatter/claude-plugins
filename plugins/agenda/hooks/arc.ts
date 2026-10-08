import type { ProcessRunResult } from 'claude-code'

import type { ArcContext, ArcSnapshot, ArcTodo } from '../types'

export const INSTALL_HINT = 'arc is not on PATH: cargo install --path ~/code/arc'

export const CONTEXT_ARGV = ['arc', 'context', '--format', 'json'] as const
export const LIST_ARGV = ['arc', 'todo', 'list', '--format', 'json'] as const

export function doneArgv(id: string): string[] {
  return ['arc', 'todo', 'done', id]
}

export function addArgv(text: string, date: string | null): string[] {
  return ['arc', 'todo', 'add', text, ...(date === null ? [] : ['--date', date])]
}

export function failure(argv: readonly string[], ran: ProcessRunResult): string | null {
  if (ran.exitCode === 0) return null
  return ran.stderr.trim() || `${argv.join(' ')} exited ${ran.exitCode}`
}

export function snapshotFrom(context: ProcessRunResult, todos: ProcessRunResult): ArcSnapshot {
  const failed = failure(CONTEXT_ARGV, context) ?? failure(LIST_ARGV, todos)
  if (failed !== null) return { kind: 'failed', reason: failed }
  try {
    return {
      kind: 'loaded',
      context: context.stdout.trim() === '' ? null : (JSON.parse(context.stdout) as ArcContext),
      todos: JSON.parse(todos.stdout) as ArcTodo[],
    }
  } catch (error) {
    return { kind: 'failed', reason: `arc printed unreadable JSON: ${error instanceof Error ? error.message : error}` }
  }
}
