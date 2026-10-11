import type { BoxProps, ButtonProps, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import type { ArcContext, ArcSnapshot, ArcTodo, ClaudeTask, Mode, Selection, TaskStatus } from '../types'
import {
  byProject,
  byStatus,
  childrenOf,
  dueGroup,
  focusSections,
  groupByDue,
  latestNext,
  repoName,
  roots,
  shortDate,
  wrapWords,
  type Detail,
  type DueGroup,
} from './agenda'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Actions = {
  complete: (id: string) => Promise<void>
  select: (selection: Selection | null) => Promise<void>
  switchTo: (mode: Mode) => Promise<void>
  refresh: () => Promise<void>
}

export type RowEnv = {
  ui: Kit
  actions: Actions
  todos: readonly ArcTodo[]
  columns: number
  today: string
  session: string
}

export const RIGHT_PADDING = 1
const MARKER_COLUMNS = 2
const PROJECT_INDENT = 1
const RULE = '┈'

const TASK_GLYPH: Record<TaskStatus, string> = { in_progress: '◐', pending: '▢', completed: '✔' }
const TASK_WORD: Record<TaskStatus, string> = { in_progress: 'in progress', pending: 'pending', completed: 'completed' }

const GROUP_COLOR: Record<DueGroup, TextProps['color']> = {
  overdue: 'error',
  today: 'warning',
  'this week': 'subtle',
  later: 'subtle',
  someday: 'inactive',
}

type Trailing = { text: string; color: TextProps['color'] }

type RowProps = {
  row: RowEnv
  selection: Selection
  marker: RenderChildren
  title: string
  indent: number
  isDim?: boolean
  trailing: readonly Trailing[]
}

function Row({ row, selection, marker, title, indent, isDim, trailing }: RowProps) {
  const { Box, Text, Button } = row.ui
  const rowKey = `${selection.kind}:${selection.id}`
  const room = row.columns - indent - MARKER_COLUMNS - trailing.reduce((width, t) => width + t.text.length + 1, 0)
  return (
    <Box key={`row:${rowKey}`} gap={1}>
      {marker}
      <Box flexGrow={1} flexDirection="column">
        {wrapWords(title, room).map((line, i) => (
          <Button
            key={i === 0 ? `open:${rowKey}` : `open:${rowKey}:${i}`}
            plain
            dimColor={isDim}
            onPress={() => row.actions.select(selection)}
          >
            {line}
          </Button>
        ))}
      </Box>
      {trailing.map(t => (
        <Text key={`trailing:${rowKey}:${t.text}`} color={t.color} dimColor={t.color === undefined}>
          {t.text}
        </Text>
      ))}
    </Box>
  )
}

const GLOBAL_TODOS = 'todos.md'

function todoOrigin(todo: ArcTodo): string {
  if (todo.repo !== null) return `repo ${repoName(todo.repo)}`
  return todo.note === GLOBAL_TODOS ? 'global todo' : todo.note
}

function todoDetails(todo: ArcTodo, row: RowEnv): string[] {
  const due = todo.date === null ? 'no due date' : `due ${shortDate(todo.date, row.today)} (${todo.date})`
  const added = todo.session === null ? [] : [todo.session === row.session ? 'added this session' : 'added in another session']
  return [due, todoOrigin(todo), ...added]
}

type TodoRowProps = { row: RowEnv; todo: ArcTodo; title: string; indent: number; glyph: string; withDate: boolean }

function TodoRow({ row, todo, title, indent, glyph, withDate }: TodoRowProps) {
  const { Button } = row.ui
  const group = dueGroup(todo.date, row.today)
  const children = childrenOf(row.todos, todo.id).length
  const trailing: Trailing[] = [
    ...(children === 0 ? [] : [{ text: `▸${children}`, color: undefined }]),
    ...(withDate && todo.date !== null ? [{ text: shortDate(todo.date, row.today), color: GROUP_COLOR[group] }] : []),
  ]
  return (
    <Row
      row={row}
      selection={{ kind: 'todo', id: todo.id }}
      marker={
        <Button key={`done:${todo.id}`} plain onPress={() => row.actions.complete(todo.id)}>
          {glyph}
        </Button>
      }
      title={title}
      indent={indent}
      isDim={group === 'someday' && withDate}
      trailing={trailing}
    />
  )
}

function TaskMarker({ ui, task }: { ui: Kit; task: ClaudeTask }) {
  const { Text } = ui
  return (
    <Text color={task.status === 'in_progress' ? 'claude' : undefined} dimColor={task.status === 'completed'}>
      {TASK_GLYPH[task.status]}
    </Text>
  )
}

function TaskRow({ row, task }: { row: RowEnv; task: ClaudeTask }) {
  return (
    <Row
      row={row}
      selection={{ kind: 'task', id: task.id }}
      marker={<TaskMarker ui={row.ui} task={task} />}
      title={task.text}
      indent={0}
      isDim={task.status === 'completed'}
      trailing={[]}
    />
  )
}

function Ruled({ row, ruleKey, indent, children }: { row: RowEnv; ruleKey: string; indent: number; children: JSX.Element[] }) {
  const { Box, Text } = row.ui
  const rule = RULE.repeat(Math.max(1, row.columns - indent))
  return (
    <Box flexDirection="column" paddingLeft={indent}>
      {children.flatMap((child, i) =>
        i === 0
          ? [child]
          : [
              <Text key={`rule:${ruleKey}:${i}`} dimColor wrap="truncate-end">
                {rule}
              </Text>,
              child,
            ],
      )}
    </Box>
  )
}

function ProjectGroups({ row, todos, groupKey, glyph, withDate }: { row: RowEnv; todos: readonly ArcTodo[]; groupKey: string; glyph: string; withDate: boolean }) {
  const { Box, Text } = row.ui
  return (
    <Box flexDirection="column">
      {byProject(todos).map(({ project, rows }) => {
        const indent = project === null ? 0 : PROJECT_INDENT
        return (
          <Box key={`project:${groupKey}:${project ?? ''}`} flexDirection="column">
            {project !== null && (
              <Box justifyContent="space-between">
                <Text color="suggestion" bold>
                  {project}
                </Text>
                <Text dimColor>{String(rows.length)}</Text>
              </Box>
            )}
            <Ruled row={row} ruleKey={`${groupKey}:${project ?? ''}`} indent={indent}>
              {rows.map(({ todo, title }) => (
                <TodoRow row={row} todo={todo} title={title} indent={indent} glyph={glyph} withDate={withDate} />
              ))}
            </Ruled>
          </Box>
        )
      })}
    </Box>
  )
}

function Controls({ row, mode }: { row: RowEnv; mode: Mode }) {
  const { Box, Button } = row.ui
  const other: Mode = mode === 'focus' ? 'overview' : 'focus'
  return (
    <Box gap={2}>
      <Button key="switch" plain dimColor hotkey={other[0]} onPress={() => row.actions.switchTo(other)}>
        {other}
      </Button>
      <Button key="refresh" plain dimColor hotkey="r" onPress={row.actions.refresh}>
        refresh
      </Button>
    </Box>
  )
}

function HeaderRule({ row, glyph, color }: { row: RowEnv; glyph: string; color: TextProps['color'] }) {
  const { Text } = row.ui
  return (
    <Text color={color} wrap="truncate-end">
      {glyph.repeat(Math.max(1, row.columns))}
    </Text>
  )
}

function Section({ ui, label, color, children }: { ui: Kit; label: string; color: TextProps['color']; children: RenderChildren }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={color} bold>
        {label}
      </Text>
      {children}
    </Box>
  )
}

type FocusTodosProps = { row: RowEnv; label: string; color: TextProps['color']; listKey: string; todos: readonly ArcTodo[] }

function FocusTodos({ row, label, color, listKey, todos }: FocusTodosProps) {
  if (todos.length === 0) return null
  return (
    <Section ui={row.ui} label={label} color={color}>
      <Ruled row={row} ruleKey={listKey} indent={0}>
        {todos.map(todo => (
          <TodoRow row={row} todo={todo} title={todo.text} indent={0} glyph="▢" withDate />
        ))}
      </Ruled>
    </Section>
  )
}

function focusTitle(context: ArcContext | null, repo: string | null): string {
  if (context !== null) return `◉ FOCUS sc-${context.story.id}`
  return repo === null ? '◉ FOCUS' : `◉ FOCUS ${repoName(repo)}`
}

function FocusHeader({ row, context, repo }: { row: RowEnv; context: ArcContext | null; repo: string | null }) {
  const { Box, Text } = row.ui
  const next = context === null ? null : latestNext(context.sessions)
  return (
    <Box flexDirection="column">
      <Box backgroundColor="claude" paddingX={1} justifyContent="space-between">
        <Text color="inverseText" bold>
          {focusTitle(context, repo)}
        </Text>
        <Text color="inverseText">{context?.story.state ?? ''}</Text>
      </Box>
      <Controls row={row} mode="focus" />
      <HeaderRule row={row} glyph="━" color="claude" />
      {context === null ? (
        <Text dimColor wrap="truncate-middle">
          {repo ?? 'no repo scope: todos here are global'}
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text bold wrap="wrap">
            {context.story.name ?? `story ${context.story.id}`}
          </Text>
          <Text dimColor wrap="truncate-middle">
            {context.branch}
          </Text>
        </Box>
      )}
      {next !== null && (
        <Box marginTop={1} gap={1}>
          <Text color="claude" bold>
            ➜ NEXT
          </Text>
          <Text wrap="wrap">{next}</Text>
        </Box>
      )}
    </Box>
  )
}

export function FocusView({ row, arc, tasks }: { row: RowEnv; arc: ArcSnapshot; tasks: readonly ClaudeTask[] }) {
  const { ui } = row
  const { Box, Text } = ui
  const context = arc.kind === 'loaded' ? arc.context : null
  const repo = arc.kind === 'loaded' ? arc.repo : null
  const place = { session: row.session, storyNote: context?.note ?? null, repo }
  const sections = focusSections(roots(row.todos), place)
  const isEmpty = tasks.length + sections.session.length + sections.story.length + sections.repo.length === 0
  return (
    <Box key="focus" flexDirection="column" paddingRight={RIGHT_PADDING}>
      <FocusHeader row={row} context={context} repo={repo} />
      {tasks.length > 0 && (
        <Section ui={ui} label="CLAUDE · THIS SESSION" color="claude">
          <Ruled row={row} ruleKey="tasks" indent={0}>
            {byStatus(tasks).map(task => (
              <TaskRow row={row} task={task} />
            ))}
          </Ruled>
        </Section>
      )}
      <FocusTodos row={row} label="ADDED THIS SESSION" color="claude" listKey="session" todos={sections.session} />
      <FocusTodos row={row} label="STORY TODOS" color="text" listKey="story" todos={sections.story} />
      <FocusTodos
        row={row}
        label={`REPO · ${repoName(repo ?? '')}`}
        color="text"
        listKey="repo"
        todos={sections.repo}
      />
      {isEmpty && (
        <Box marginTop={1}>
          <Text dimColor>nothing in focus yet</Text>
        </Box>
      )}
      <ArcStatus ui={ui} arc={arc} />
    </Box>
  )
}

export function OverviewView({ row, arc }: { row: RowEnv; arc: ArcSnapshot }) {
  const { ui } = row
  const { Box, Text } = ui
  const todos = roots(row.todos)
  const context = arc.kind === 'loaded' ? arc.context : null
  return (
    <Box key="overview" flexDirection="column" paddingRight={RIGHT_PADDING}>
      <Box justifyContent="space-between">
        <Text color="subtle" bold>
          ◇ overview
        </Text>
        <Text dimColor>{todos.length} open</Text>
      </Box>
      <Controls row={row} mode="overview" />
      <HeaderRule row={row} glyph="─" color="subtle" />
      {context !== null && (
        <Text dimColor wrap="truncate-end">
          ↳ in focus: sc-{String(context.story.id)} {context.story.name ?? ''}
        </Text>
      )}
      {groupByDue(todos, row.today).map(([group, members]) => (
        <Box key={`group:${group}`} flexDirection="column" marginTop={1}>
          <Text color={GROUP_COLOR[group]} italic>
            {group}
          </Text>
          <ProjectGroups row={row} todos={members} groupKey={group} glyph="○" withDate />
        </Box>
      ))}
      {arc.kind === 'loaded' && todos.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>no open todos</Text>
        </Box>
      )}
      <ArcStatus ui={ui} arc={arc} />
    </Box>
  )
}

function DetailBody({ row, detail }: { row: RowEnv; detail: Detail }) {
  const { Box, Text, Button } = row.ui
  if (detail.kind === 'task') {
    const { task } = detail
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <TaskMarker ui={row.ui} task={task} />
          <Text bold wrap="wrap">
            {task.text}
          </Text>
        </Box>
        <Description ui={row.ui} text={task.detail} />
        <Text dimColor wrap="wrap">
          {[TASK_WORD[task.status], 'Claude task'].join(' · ')}
        </Text>
      </Box>
    )
  }
  const { todo, children, back } = detail
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Button
          key={`done:${todo.id}`}
          plain
          onPress={() => row.actions.complete(todo.id).then(() => row.actions.select(back))}
        >
          ▢
        </Button>
        <Text bold wrap="wrap">
          {todo.text}
        </Text>
      </Box>
      <Description ui={row.ui} text={todo.description} />
      <Text dimColor wrap="wrap">
        {todoDetails(todo, row).join(' · ')}
      </Text>
      {children.length > 0 && (
        <Section ui={row.ui} label="SUBTODOS" color="text">
          <Ruled row={row} ruleKey={`children:${todo.id}`} indent={0}>
            {children.map(child => (
              <TodoRow row={row} todo={child} title={child.text} indent={0} glyph="▢" withDate />
            ))}
          </Ruled>
        </Section>
      )}
    </Box>
  )
}

function Description({ ui, text }: { ui: Kit; text: string | null }) {
  const { Box, Text } = ui
  return (
    <Box marginY={1}>
      {text === null ? <Text dimColor>no description</Text> : <Text wrap="wrap">{text}</Text>}
    </Box>
  )
}

export function DetailView({ row, detail }: { row: RowEnv; detail: Detail }) {
  const { Box, Button } = row.ui
  return (
    <Box key="detail" flexDirection="column" paddingRight={RIGHT_PADDING}>
      <Button key="back" plain dimColor hotkey="b" onPress={() => row.actions.select(detail.back)}>
        ← back
      </Button>
      <HeaderRule row={row} glyph="─" color="subtle" />
      <DetailBody row={row} detail={detail} />
    </Box>
  )
}

function ArcStatus({ ui, arc }: { ui: Kit; arc: ArcSnapshot }) {
  const { Box, Text } = ui
  if (arc.kind === 'loaded') return null
  return (
    <Box marginTop={1}>
      {arc.kind === 'loading' ? <Text dimColor>loading arc…</Text> : <Text color="error">{arc.reason}</Text>}
    </Box>
  )
}
