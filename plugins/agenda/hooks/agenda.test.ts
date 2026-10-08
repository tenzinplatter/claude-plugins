import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import type { ArcTodo } from '../types'
import { applyTaskCall, byProject, focusSections, groupByDue, latestNext, parseAddArgs, wrapWords } from './agenda'

const TODAY = '2026-10-08'
const SESSION = 'sess-here'
const HEARTH = 'github.com/tenzinplatter/hearth'
const PANE = {
  title: 'Agenda',
  isFocused: false,
  bodyColumns: 48,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

const CONTEXT = {
  story: { id: 7, name: 'Depth alignment', state: 'In Progress', type: 'feature', url: 'https://app.shortcut.com/x/story/7' },
  branch: 'tenzin/sc-7/depth-align',
  resolved_by: 'branch_id',
  canonical_branch: null,
  note: 'stories/depth-align.md',
  sessions: ['### 2026-10-07 09:00 · b\n**Done:** a\n**Next:** wire stereo config'],
  open_todos: [],
}

function todo(id: string, text: string, fields: Partial<ArcTodo> = {}): ArcTodo {
  return { id, text, date: null, note: 'todos.md', repo: null, session: null, ...fields }
}

const TODOS: ArcTodo[] = [
  todo('a', 'benchmark at 720p', { note: 'stories/depth-align.md' }),
  todo('b', 'book flights', { date: '2026-10-08' }),
  todo('c', 'reply re: epics', { date: '2026-10-01' }),
  todo('d', 'stockeye: Jetson: confirm calibration'),
  todo('e', 'stockeye: re-cut clips'),
  todo('f', 'wire the notifier', { note: 'todos/github.com/tenzinplatter/hearth.md', repo: HEARTH, session: 'sess-other' }),
  todo('g', 'from this session', { note: 'todos/github.com/tenzinplatter/hearth.md', repo: HEARTH, session: SESSION }),
]

function ran(stdout: string): { value: ProcessRunResult } {
  return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as ProcessRunResult }
}

type Place = { inStory: boolean; repo?: string | null; listing?: unknown }

function fakeArc(on: On, { inStory, repo = null, listing }: Place): string[][] {
  const calls: string[][] = []
  on('process.run', ($, e) => {
    calls.push([...e.argv])
    if (e.argv[1] === 'context') return ran(inStory ? JSON.stringify(CONTEXT) : '')
    if (e.argv[2] === 'list') return ran(JSON.stringify(listing ?? { repo, todos: TODOS }))
    return ran('')
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    calls.push(['ui.open', String(e.columns)])
    return { value: { isPlaced: true } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: SESSION }))
  on('session.cwd', () => ({ value: '/home/t/code/hearth' }))
  mock.clock(on, { now: Date.parse(`${TODAY}T09:00:00`) })
  return calls
}

async function texts(ui: { findAll: (query: { type: 'Text' }) => Promise<{ text: string }[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(found => found.text)
}

describe('agenda logic', () => {
  test('tasks follow TaskCreate, TaskUpdate and TodoWrite', () => {
    const created = applyTaskCall([], { tool: 'TaskCreate', id: '1', subject: 'write tests', detail: 'cover the pane' })
    const started = applyTaskCall(created, { tool: 'TaskUpdate', id: '1', status: 'in_progress' })
    expect(started).toEqual([{ id: '1', text: 'write tests', detail: 'cover the pane', status: 'in_progress' }])
    expect(applyTaskCall(started, { tool: 'TaskUpdate', id: '1', status: 'deleted' })).toEqual([])
    expect(
      applyTaskCall(started, { tool: 'TodoWrite', todos: [{ content: 'other', status: 'pending' }] }),
    ).toEqual([{ id: 'todo-0', text: 'other', detail: null, status: 'pending' }])
  })

  test('repo todos group under their repo; unscoped ones by a shared prefix', () => {
    const groups = byProject([...TODOS, todo('h', 'Note: lone prefix')])
    expect(groups.map(g => [g.project, g.rows.map(r => r.title)])).toEqual([
      [null, ['benchmark at 720p', 'book flights', 'reply re: epics', 'Note: lone prefix']],
      ['hearth', ['wire the notifier', 'from this session']],
      ['stockeye', ['Jetson: confirm calibration', 're-cut clips']],
    ])
  })

  test('focus takes this session first, then the story, then the repo, each todo once', () => {
    const sections = focusSections(TODOS, { session: SESSION, storyNote: 'stories/depth-align.md', repo: HEARTH })
    expect([sections.session, sections.story, sections.repo].map(list => list.map(t => t.id))).toEqual([
      ['g'],
      ['a'],
      ['f'],
    ])
    const nowhere = focusSections(TODOS, { session: 'none', storyNote: null, repo: null })
    expect([nowhere.session, nowhere.story, nowhere.repo]).toEqual([[], [], []])
  })

  test('titles wrap on word boundaries and split words longer than a line', () => {
    expect(wrapWords('short', 10)).toEqual(['short'])
    expect(wrapWords('floor plane hip height in geometry', 12)).toEqual(['floor plane', 'hip height', 'in geometry'])
    expect(wrapWords('~/cattle-recordings/fixed now', 10)).toEqual(['~/cattle-r', 'ecordings/', 'fixed now'])
    expect(wrapWords('', 10)).toEqual([''])
  })

  test('todos group by how soon they are due', () => {
    const groups = groupByDue(TODOS, TODAY).map(([group, members]) => [group, members.map(t => t.id)])
    expect(groups).toEqual([
      ['overdue', ['c']],
      ['today', ['b']],
      ['someday', ['a', 'd', 'e', 'f', 'g']],
    ])
  })

  test('add takes an optional @date anywhere', () => {
    expect(parseAddArgs('book @2026-10-10 flights')).toEqual({ text: 'book flights', date: '2026-10-10' })
    expect(parseAddArgs('email @harry')).toEqual({ text: 'email @harry', date: null })
    expect(parseAddArgs('  ')).toBeNull()
  })

  test('next comes from the latest handoff that has one', () => {
    expect(latestNext(['**Next:** old', '### auto\n**Commits:**', '**Done:** x\n**Next:** new'])).toBe('new')
    expect(latestNext([])).toBeNull()
  })
})

describe('agenda pane', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`focus in a story shows Claude's tasks, then this session, the story and the repo (${surface})`, async ($, on) => {
      fakeArc(on, { inStory: true, repo: HEARTH })
      on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'write tests' } } }))
      await $.command.run({ command: 'agenda', args: 'focus' } as never)
      await $.tool.call({ tool: 'TaskCreate', subject: 'write tests', description: 'd' })

      const ui = await $.ui.mount({ plugin: 'agenda', surface, component: 'Pane', requestId: 'agenda', props: PANE })
      const shown = await texts(ui)
      expect(shown).toContain('◉ FOCUS sc-7')
      expect(shown).toContain('wire stereo config')
      const order = ['CLAUDE · THIS SESSION', 'ADDED THIS SESSION', 'STORY TODOS', 'REPO · hearth'].map(label =>
        shown.indexOf(label),
      )
      expect(order.every(at => at >= 0)).toBe(true)
      expect([...order].sort((x, y) => x - y)).toEqual(order)
      expect((await ui.find({ key: 'open:task:1' }))?.text).toBe('write tests')
      expect((await ui.find({ key: 'open:todo:g' }))?.text).toBe('from this session')
      expect(await ui.find({ key: 'open:todo:b' })).toBeUndefined()
      await ui.unmount()
    })

    test(`focus outside any story is headed by the repo (${surface})`, async ($, on) => {
      fakeArc(on, { inStory: false, repo: HEARTH })
      await $.command.run({ command: 'agenda', args: '' } as never)

      const ui = await $.ui.mount({ plugin: 'agenda', surface, component: 'Pane', requestId: 'agenda', props: PANE })
      const shown = await texts(ui)
      expect(shown).toContain('◉ FOCUS hearth')
      expect(shown).toContain(HEARTH)
      expect(shown).not.toContain('STORY TODOS')
      expect((await ui.find({ key: 'open:todo:f' }))?.text).toBe('wire the notifier')
      await ui.unmount()
    })

    test(`overview lists everything and completes through arc (${surface})`, async ($, on) => {
      const calls = fakeArc(on, { inStory: false })
      await $.command.run({ command: 'agenda', args: '' } as never)

      const ui = await $.ui.mount({ plugin: 'agenda', surface, component: 'Pane', requestId: 'agenda', props: PANE })
      const shown = await texts(ui)
      expect(shown).toContain('◇ overview')
      expect(shown).toContain('overdue')
      expect((await ui.find({ key: 'open:todo:b' }))?.text).toBe('book flights')
      expect(shown).toContain('stockeye')
      expect(shown).toContain('hearth')
      expect((await ui.find({ key: 'open:todo:d' }))?.text).toBe('Jetson: confirm calibration')
      expect(shown.some(text => text.startsWith('┈'))).toBe(true)

      await ui.press({ key: 'done:b' })
      expect(calls).toContainEqual(['arc', 'todo', 'done', 'b'])
      await ui.unmount()
    })
  }

  test('an expanded row says where the todo came from and which session added it', async ($, on) => {
    fakeArc(on, { inStory: true, repo: HEARTH })
    on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'write tests' } } }))
    await $.command.run({ command: 'agenda', args: 'focus' } as never)
    await $.tool.call({ tool: 'TaskCreate', subject: 'write tests', description: 'cover the pane on every surface' })

    const ui = await $.ui.mount({ plugin: 'agenda', surface: 'terminal', component: 'Pane', requestId: 'agenda', props: PANE })
    expect(await texts(ui)).not.toContain('cover the pane on every surface')

    await ui.press({ key: 'open:task:1' })
    expect(await texts(ui)).toContain('cover the pane on every surface')
    await ui.press({ key: 'open:todo:a' })
    expect(await texts(ui)).toContain('no due date · stories/depth-align.md')
    await ui.press({ key: 'open:todo:g' })
    expect(await texts(ui)).toContain('no due date · repo hearth · added this session')
    await ui.press({ key: 'open:todo:f' })
    expect(await texts(ui)).toContain('no due date · repo hearth · added in another session')

    await ui.press({ key: 'open:task:1' })
    expect(await texts(ui)).not.toContain('cover the pane on every surface')
    await ui.unmount()
  })

  test('the dock asks for 40 columns by default', async ($, on) => {
    const calls = fakeArc(on, { inStory: false })
    await $.command.run({ command: 'agenda', args: '' } as never)
    expect(calls).toContainEqual(['ui.open', '40'])
  })

  test('the dock width follows the dockColumns setting', { options: { dockColumns: 32 } }, async ($, on) => {
    const calls = fakeArc(on, { inStory: false })
    await $.command.run({ command: 'agenda', args: 'overview' } as never)
    expect(calls).toContainEqual(['ui.open', '32'])
  })

  test('a long title wraps over several pressable lines', async ($, on) => {
    fakeArc(on, { inStory: false })
    await $.command.run({ command: 'agenda', args: '' } as never)
    const narrow = { ...PANE, bodyColumns: 21 }
    const ui = await $.ui.mount({ plugin: 'agenda', surface: 'terminal', component: 'Pane', requestId: 'agenda', props: narrow })
    expect((await ui.find({ key: 'open:todo:d' }))?.text).toBe('Jetson: confirm')
    expect((await ui.find({ key: 'open:todo:d:1' }))?.text).toBe('calibration')
    await ui.press({ key: 'open:todo:d:1' })
    expect(await texts(ui)).toContain('no due date · global todo')
    await ui.unmount()
  })

  test('add hands the text, date and this session to arc', async ($, on) => {
    const calls = fakeArc(on, { inStory: false })
    await $.command.run({ command: 'agenda', args: 'add book flights @2026-10-10' } as never)
    expect(calls).toContainEqual(['arc', 'todo', 'add', 'book flights', '--session', SESSION, '--date', '2026-10-10'])
  })

  test("Claude's arc add_todo calls carry this session and its directory", async ($, on) => {
    fakeArc(on, { inStory: false })
    const seen: Record<string, unknown>[] = []
    on('tool.call', { tool: 'mcp__arc__add_todo' }, ($, e) => {
      seen.push({ ...e })
      return { result: { content: [] } }
    })
    await $.tool.call({ tool: 'mcp__arc__add_todo', text: 'ship it' })
    await $.tool.call({ tool: 'mcp__arc__add_todo', text: 'elsewhere', cwd: '/srv/other', session_id: 'given' })
    expect(seen.map(e => [e.text, e.session_id, e.cwd])).toEqual([
      ['ship it', SESSION, '/home/t/code/hearth'],
      ['elsewhere', 'given', '/srv/other'],
    ])
  })

  test('a repo without an origin gets no repo scope, and says so', async ($, on) => {
    fakeArc(on, { inStory: false, repo: null })
    await $.command.run({ command: 'agenda', args: 'focus' } as never)
    const ui = await $.ui.mount({ plugin: 'agenda', surface: 'terminal', component: 'Pane', requestId: 'agenda', props: PANE })
    const shown = await texts(ui)
    expect(shown).toContain('◉ FOCUS')
    expect(shown).toContain('no repo scope: todos here are global')
    expect(shown.some(text => text.startsWith('REPO ·'))).toBe(false)
    await ui.unmount()
  })

  test('an arc that still prints a bare list says to reinstall it', async ($, on) => {
    fakeArc(on, { inStory: false, listing: TODOS })
    await $.command.run({ command: 'agenda', args: '' } as never)
    const ui = await $.ui.mount({ plugin: 'agenda', surface: 'terminal', component: 'Pane', requestId: 'agenda', props: PANE })
    expect((await texts(ui)).some(text => text.includes('reinstall'))).toBe(true)
    await ui.unmount()
  })
})
