import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { applyTaskCall, byProject, groupByDue, latestNext, parseAddArgs, truncate } from './agenda'

const TODAY = '2026-10-08'
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

const TODOS = [
  { id: 'a', text: 'benchmark at 720p', date: null, note: 'stories/depth-align.md' },
  { id: 'b', text: 'book flights', date: '2026-10-08', note: null },
  { id: 'c', text: 'reply re: epics', date: '2026-10-01', note: null },
  { id: 'd', text: 'stockeye: Jetson: confirm calibration', date: null, note: null },
  { id: 'e', text: 'stockeye: re-cut clips', date: null, note: null },
]

function ran(stdout: string): { value: ProcessRunResult } {
  return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as ProcessRunResult }
}

function fakeArc(on: On, { inStory }: { inStory: boolean }): string[][] {
  const calls: string[][] = []
  on('process.run', ($, e) => {
    calls.push([...e.argv])
    if (e.argv[1] === 'context') return ran(inStory ? JSON.stringify(CONTEXT) : '')
    if (e.argv[2] === 'list') return ran(JSON.stringify(TODOS))
    return ran('')
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  mock.clock(on, { now: Date.parse(`${TODAY}T09:00:00`) })
  return calls
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

  test('a prefix two todos share becomes a project and leaves their titles', () => {
    const groups = byProject([...TODOS, { id: 'f', text: 'Note: lone prefix', date: null, note: null }])
    expect(groups.map(g => [g.project, g.rows.map(r => r.title)])).toEqual([
      [null, ['benchmark at 720p', 'book flights', 'reply re: epics', 'Note: lone prefix']],
      ['stockeye', ['Jetson: confirm calibration', 're-cut clips']],
    ])
  })

  test('long titles are cut with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short')
    expect(truncate('a much longer title', 8)).toBe('a much …')
  })

  test('todos group by how soon they are due', () => {
    const groups = groupByDue(TODOS, TODAY).map(([group, members]) => [group, members.map(t => t.id)])
    expect(groups).toEqual([
      ['overdue', ['c']],
      ['today', ['b']],
      ['someday', ['a', 'd', 'e']],
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
    test(`focus shows the story and Claude's tasks first (${surface})`, async ($, on) => {
      fakeArc(on, { inStory: true })
      on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'write tests' } } }))
      await $.command.run({ command: 'agenda', args: 'focus' } as never)
      await $.tool.call({ tool: 'TaskCreate', subject: 'write tests', description: 'd' })

      const ui = await $.ui.mount({ plugin: 'agenda', surface, component: 'Pane', requestId: 'agenda', props: PANE })
      const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
      expect(texts).toContain('◉ FOCUS sc-7')
      expect(texts).toContain('wire stereo config')
      expect(texts.indexOf('CLAUDE · THIS SESSION')).toBeLessThan(texts.indexOf('STORY TODOS'))
      expect((await ui.find({ key: 'open:task:1' }))?.text).toBe('write tests')
      expect(await ui.find({ key: 'open:todo:b' })).toBeUndefined()
      await ui.unmount()
    })

    test(`overview lists everything and completes through arc (${surface})`, async ($, on) => {
      const calls = fakeArc(on, { inStory: false })
      await $.command.run({ command: 'agenda', args: '' } as never)

      const ui = await $.ui.mount({ plugin: 'agenda', surface, component: 'Pane', requestId: 'agenda', props: PANE })
      const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
      expect(texts).toContain('◇ overview')
      expect(texts).toContain('overdue')
      expect((await ui.find({ key: 'open:todo:b' }))?.text).toBe('book flights')

      expect(texts).toContain('stockeye')
      expect((await ui.find({ key: 'open:todo:d' }))?.text).toBe('Jetson: confirm calibration')
      expect(texts.some(text => text.startsWith('┈'))).toBe(true)

      await ui.press({ key: 'done:b' })
      expect(calls).toContainEqual(['arc', 'todo', 'done', 'b'])
      await ui.unmount()
    })
  }

  test('pressing a row expands its details and pressing again collapses it', async ($, on) => {
    fakeArc(on, { inStory: true })
    on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'write tests' } } }))
    await $.command.run({ command: 'agenda', args: 'focus' } as never)
    await $.tool.call({ tool: 'TaskCreate', subject: 'write tests', description: 'cover the pane on every surface' })

    const ui = await $.ui.mount({ plugin: 'agenda', surface: 'terminal', component: 'Pane', requestId: 'agenda', props: PANE })
    const texts = async () => (await ui.findAll({ type: 'Text' })).map(found => found.text)
    expect(await texts()).not.toContain('cover the pane on every surface')

    await ui.press({ key: 'open:task:1' })
    expect(await texts()).toContain('cover the pane on every surface')
    await ui.press({ key: 'open:todo:a' })
    expect(await texts()).toContain('no due date · stories/depth-align.md')

    await ui.press({ key: 'open:task:1' })
    expect(await texts()).not.toContain('cover the pane on every surface')
    await ui.unmount()
  })

  test('add hands the text and date to arc', async ($, on) => {
    const calls = fakeArc(on, { inStory: false })
    await $.command.run({ command: 'agenda', args: 'add book flights @2026-10-10' } as never)
    expect(calls).toContainEqual(['arc', 'todo', 'add', 'book flights', '--date', '2026-10-10'])
  })
})
