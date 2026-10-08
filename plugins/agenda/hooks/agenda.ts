import type { ArcTodo, ClaudeTask, TaskStatus } from '../types'

export type DueGroup = 'overdue' | 'today' | 'this week' | 'later' | 'someday'

export const DUE_GROUPS: readonly DueGroup[] = ['overdue', 'today', 'this week', 'later', 'someday']

const DAY_MS = 86_400_000

export function localDate(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
}

export function dueGroup(date: string | null, today: string): DueGroup {
  if (date === null) return 'someday'
  const days = daysBetween(today, date)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days < 7) return 'this week'
  return 'later'
}

export function groupByDue(todos: readonly ArcTodo[], today: string): [DueGroup, ArcTodo[]][] {
  const sorted = [...todos].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  return DUE_GROUPS.map(group => [group, sorted.filter(t => dueGroup(t.date, today) === group)] as [DueGroup, ArcTodo[]])
    .filter(([, members]) => members.length > 0)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function shortDate(date: string, today: string): string {
  const days = daysBetween(today, date)
  const d = new Date(Date.parse(date))
  if (days === 1) return 'tomorrow'
  if (days > 1 && days < 7) return WEEKDAYS[d.getUTCDay()]!
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const STATUS_ORDER: Record<TaskStatus, number> = { in_progress: 0, pending: 1, completed: 2 }

export function byStatus(tasks: readonly ClaudeTask[]): ClaudeTask[] {
  return [...tasks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
}

export type TaskCall =
  | { tool: 'TodoWrite'; todos: readonly { content: string; status: TaskStatus }[] }
  | { tool: 'TaskCreate'; id: string; subject: string }
  | { tool: 'TaskUpdate'; id: string; subject?: string; status?: TaskStatus | 'deleted' }

export function applyTaskCall(tasks: readonly ClaudeTask[], call: TaskCall): ClaudeTask[] {
  switch (call.tool) {
    case 'TodoWrite':
      return call.todos.map((todo, i) => ({ id: `todo-${i}`, text: todo.content, status: todo.status }))
    case 'TaskCreate':
      return [...tasks, { id: call.id, text: call.subject, status: 'pending' }]
    case 'TaskUpdate': {
      const { id, subject, status } = call
      if (status === 'deleted') return tasks.filter(task => task.id !== id)
      return tasks.map(task =>
        task.id === id ? { ...task, text: subject ?? task.text, status: status ?? task.status } : task,
      )
    }
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseAddArgs(args: string): { text: string; date: string | null } | null {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const dated = words.findIndex(word => word.startsWith('@') && ISO_DATE.test(word.slice(1)))
  const date = dated === -1 ? null : words[dated]!.slice(1)
  const text = words.filter((_, i) => i !== dated).join(' ')
  return text === '' ? null : { text, date }
}

export function latestNext(sessions: readonly string[]): string | null {
  for (const entry of [...sessions].reverse()) {
    const line = entry.split('\n').find(l => l.startsWith('**Next:**'))
    if (line !== undefined) return line.slice('**Next:**'.length).trim()
  }
  return null
}
