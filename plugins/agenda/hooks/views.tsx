import type { BoxProps, ButtonProps, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import type { ArcContext, ArcSnapshot, ArcTodo, ClaudeTask, Mode, TaskStatus } from '../types'
import { byProject, byStatus, dueGroup, groupByDue, latestNext, shortDate, truncate, type DueGroup } from './agenda'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Actions = {
  complete: (id: string) => Promise<void>
  toggle: (key: string) => Promise<void>
  switchTo: (mode: Mode) => Promise<void>
  refresh: () => Promise<void>
}

export type RowEnv = {
  ui: Kit
  actions: Actions
  open: readonly string[]
  columns: number
  today: string
}

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

type RowProps = {
  row: RowEnv
  rowKey: string
  marker: RenderChildren
  title: string
  indent: number
  isDim?: boolean
  trailing?: { text: string; color: TextProps['color'] }
  details: readonly string[]
  body: string | null
}

function ExpandableRow({ row, rowKey, marker, title, indent, isDim, trailing, details, body }: RowProps) {
  const { Box, Text, Button } = row.ui
  const isOpen = row.open.includes(rowKey)
  const room = row.columns - indent - MARKER_COLUMNS - (trailing === undefined ? 0 : trailing.text.length + 1)
  const label = truncate(title, room)
  const hidden = label === title ? null : title
  return (
    <Box key={`row:${rowKey}`} flexDirection="column">
      <Box gap={1}>
        {marker}
        <Box flexGrow={1}>
          <Button key={`open:${rowKey}`} plain dimColor={isDim} onPress={() => row.actions.toggle(rowKey)}>
            {label}
          </Button>
        </Box>
        {trailing !== undefined && <Text color={trailing.color}>{trailing.text}</Text>}
      </Box>
      {isOpen && (
        <Box key={`detail:${rowKey}`} flexDirection="column" paddingLeft={MARKER_COLUMNS} marginBottom={1}>
          {hidden !== null && <Text wrap="wrap">{hidden}</Text>}
          {body !== null && <Text wrap="wrap">{body}</Text>}
          <Text dimColor wrap="wrap">
            {details.join(' · ')}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function todoDetails(todo: ArcTodo, today: string): string[] {
  return [
    todo.date === null ? 'no due date' : `due ${shortDate(todo.date, today)} (${todo.date})`,
    todo.note === null ? 'manual todo' : todo.note,
  ]
}

type TodoRowProps = { row: RowEnv; todo: ArcTodo; title: string; indent: number; glyph: string; withDate: boolean }

function TodoRow({ row, todo, title, indent, glyph, withDate }: TodoRowProps) {
  const { Button } = row.ui
  const group = dueGroup(todo.date, row.today)
  return (
    <ExpandableRow
      row={row}
      rowKey={`todo:${todo.id}`}
      marker={
        <Button key={`done:${todo.id}`} plain onPress={() => row.actions.complete(todo.id)}>
          {glyph}
        </Button>
      }
      title={title}
      indent={indent}
      isDim={group === 'someday' && withDate}
      trailing={withDate && todo.date !== null ? { text: shortDate(todo.date, row.today), color: GROUP_COLOR[group] } : undefined}
      details={todoDetails(todo, row.today)}
      body={null}
    />
  )
}

function TaskRow({ row, task }: { row: RowEnv; task: ClaudeTask }) {
  const { Text } = row.ui
  return (
    <ExpandableRow
      row={row}
      rowKey={`task:${task.id}`}
      marker={
        <Text color={task.status === 'in_progress' ? 'claude' : undefined} dimColor={task.status === 'completed'}>
          {TASK_GLYPH[task.status]}
        </Text>
      }
      title={task.text}
      indent={0}
      isDim={task.status === 'completed'}
      details={[TASK_WORD[task.status], 'Claude task']}
      body={task.detail}
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

function FocusHeader({ row, context }: { row: RowEnv; context: ArcContext | null }) {
  const { Box, Text } = row.ui
  const next = context === null ? null : latestNext(context.sessions)
  return (
    <Box flexDirection="column">
      <Box backgroundColor="claude" paddingX={1} justifyContent="space-between">
        <Text color="inverseText" bold>
          {context === null ? '◉ FOCUS' : `◉ FOCUS sc-${context.story.id}`}
        </Text>
        <Text color="inverseText">{context?.story.state ?? ''}</Text>
      </Box>
      <Controls row={row} mode="focus" />
      <HeaderRule row={row} glyph="━" color="claude" />
      {context === null ? (
        <Text dimColor>no arc story for this branch</Text>
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
  const storyTodos = arc.kind === 'loaded' && context !== null ? arc.todos.filter(t => t.note === context.note) : []
  return (
    <Box key="focus" flexDirection="column">
      <FocusHeader row={row} context={context} />
      {tasks.length > 0 && (
        <Section ui={ui} label="CLAUDE · THIS SESSION" color="claude">
          <Ruled row={row} ruleKey="tasks" indent={0}>
            {byStatus(tasks).map(task => (
              <TaskRow row={row} task={task} />
            ))}
          </Ruled>
        </Section>
      )}
      {storyTodos.length > 0 && (
        <Section ui={ui} label="STORY TODOS" color="text">
          <ProjectGroups row={row} todos={storyTodos} groupKey="story" glyph="▢" withDate={false} />
        </Section>
      )}
      {tasks.length === 0 && storyTodos.length === 0 && (
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
  const todos = arc.kind === 'loaded' ? arc.todos : []
  const context = arc.kind === 'loaded' ? arc.context : null
  return (
    <Box key="overview" flexDirection="column">
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

function ArcStatus({ ui, arc }: { ui: Kit; arc: ArcSnapshot }) {
  const { Box, Text } = ui
  if (arc.kind === 'loaded') return null
  return (
    <Box marginTop={1}>
      {arc.kind === 'loading' ? <Text dimColor>loading arc…</Text> : <Text color="error">{arc.reason}</Text>}
    </Box>
  )
}
