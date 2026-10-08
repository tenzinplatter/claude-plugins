import type { ProcessRunResult } from 'claude-code'

import type { ArcContext, ArcListing, ArcSnapshot } from '../types'

export const INSTALL_HINT = 'arc is not on PATH: cargo install --path ~/code/arc'
export const OUTDATED_HINT = 'arc predates repo-scoped todos: reinstall it with cargo install --path ~/code/arc'

export const CONTEXT_ARGV = ['arc', 'context', '--format', 'json'] as const
export const LIST_ARGV = ['arc', 'todo', 'list', '--format', 'json'] as const

export function doneArgv(id: string): string[] {
  return ['arc', 'todo', 'done', id]
}

export function addArgv(text: string, date: string | null, session: string): string[] {
  return ['arc', 'todo', 'add', text, '--session', session, ...(date === null ? [] : ['--date', date])]
}

export function failure(argv: readonly string[], ran: ProcessRunResult): string | null {
  if (ran.exitCode === 0) return null
  return ran.stderr.trim() || `${argv.join(' ')} exited ${ran.exitCode}`
}

export function snapshotFrom(context: ProcessRunResult, todos: ProcessRunResult): ArcSnapshot {
  const failed = failure(CONTEXT_ARGV, context) ?? failure(LIST_ARGV, todos)
  if (failed !== null) return { kind: 'failed', reason: failed }
  try {
    const listing = JSON.parse(todos.stdout) as ArcListing | unknown[]
    if (Array.isArray(listing)) return { kind: 'failed', reason: OUTDATED_HINT }
    return {
      kind: 'loaded',
      context: context.stdout.trim() === '' ? null : (JSON.parse(context.stdout) as ArcContext),
      repo: listing.repo,
      todos: listing.todos,
    }
  } catch (error) {
    return { kind: 'failed', reason: `arc printed unreadable JSON: ${error instanceof Error ? error.message : error}` }
  }
}
