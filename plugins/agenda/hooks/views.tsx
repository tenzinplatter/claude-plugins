import type { BoxProps, ButtonProps, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import type { ArcContext, ArcSnapshot, ClaudeTask, Mode, TaskStatus } from '../types'
import { byStatus, groupByDue, latestNext, shortDate, type DueGroup } from './agenda'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Actions = {
  complete: (id: string) => Promise<void>
  switchTo: (mode: Mode) => Promise<void>
  refresh: () => Promise<void>
}

const TASK_GLYPH: Record<TaskStatus, string> = { in_progress: '◐', pending: '▢', completed: '✔' }

function Footer({ ui, mode, actions }: { ui: Kit; mode: Mode; actions: Actions }) {
  const { Box, Button } = ui
  const other: Mode = mode === 'focus' ? 'overview' : 'focus'
  return (
    <Box marginTop={1} gap={1}>
      <Button key="switch" hotkey={other[0]} onPress={() => actions.switchTo(other)}>
        {other}
      </Button>
      <Button key="refresh" hotkey="r" onPress={actions.refresh}>
        refresh
      </Button>
    </Box>
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

function StoryHeader({ ui, context }: { ui: Kit; context: ArcContext | null }) {
  const { Box, Text } = ui
  if (context === null) {
    return (
      <Box flexDirection="column">
        <Box backgroundColor="claude" paddingX={1}>
          <Text color="inverseText" bold>
            ◉ FOCUS
          </Text>
        </Box>
        <Text dimColor>no arc story for this branch</Text>
      </Box>
    )
  }
  const { story, branch } = context
  const next = latestNext(context.sessions)
  return (
    <Box flexDirection="column">
      <Box backgroundColor="claude" paddingX={1} justifyContent="space-between">
        <Text color="inverseText" bold>
          ◉ FOCUS sc-{String(story.id)}
        </Text>
        <Text color="inverseText">{story.state ?? ''}</Text>
      </Box>
      <Text bold wrap="truncate-end">
        {story.name ?? `story ${story.id}`}
      </Text>
      <Text dimColor wrap="truncate-middle">
        {branch}
      </Text>
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

export function FocusView({ ui, arc, tasks, actions }: { ui: Kit; arc: ArcSnapshot; tasks: readonly ClaudeTask[]; actions: Actions }) {
  const { Box, Text, Button } = ui
  const context = arc.kind === 'loaded' ? arc.context : null
  const storyTodos = arc.kind === 'loaded' && context !== null ? arc.todos.filter(t => t.note === context.note) : []
  return (
    <Box key="focus" flexDirection="column" borderStyle="bold" borderColor="claude" paddingX={1}>
      <StoryHeader ui={ui} context={context} />
      {tasks.length > 0 && (
        <Section ui={ui} label="CLAUDE · THIS SESSION" color="claude">
          {byStatus(tasks).map(task => (
            <Box key={`task:${task.id}`} gap={1}>
              <Text color={task.status === 'in_progress' ? 'claude' : undefined} dimColor={task.status === 'completed'}>
                {TASK_GLYPH[task.status]}
              </Text>
              <Text
                wrap="truncate-end"
                bold={task.status === 'in_progress'}
                dimColor={task.status === 'completed'}
                strikethrough={task.status === 'completed'}
              >
                {task.text}
              </Text>
            </Box>
          ))}
        </Section>
      )}
      {storyTodos.length > 0 && (
        <Section ui={ui} label="STORY TODOS" color="text">
          {storyTodos.map(todo => (
            <Box key={`row:${todo.id}`} gap={1}>
              <Button key={`done:${todo.id}`} plain onPress={() => actions.complete(todo.id)}>
                ▢
              </Button>
              <Text wrap="truncate-end">{todo.text}</Text>
            </Box>
          ))}
        </Section>
      )}
      {tasks.length === 0 && storyTodos.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>nothing in focus yet</Text>
        </Box>
      )}
      <ArcStatus ui={ui} arc={arc} />
      <Footer ui={ui} mode="focus" actions={actions} />
    </Box>
  )
}

const GROUP_COLOR: Record<DueGroup, TextProps['color']> = {
  overdue: 'error',
  today: 'warning',
  'this week': 'subtle',
  later: 'subtle',
  someday: 'inactive',
}

export function OverviewView({ ui, arc, today, actions }: { ui: Kit; arc: ArcSnapshot; today: string; actions: Actions }) {
  const { Box, Text, Button } = ui
  const todos = arc.kind === 'loaded' ? arc.todos : []
  const context = arc.kind === 'loaded' ? arc.context : null
  return (
    <Box key="overview" flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="subtle">◇ overview</Text>
        <Text dimColor>{todos.length} open</Text>
      </Box>
      {groupByDue(todos, today).map(([group, members]) => (
        <Box key={`group:${group}`} flexDirection="column" marginTop={1}>
          <Text color={GROUP_COLOR[group]} italic>
            {group}
          </Text>
          {members.map(todo => (
            <Box key={`row:${todo.id}`} gap={1}>
              <Button key={`done:${todo.id}`} plain onPress={() => actions.complete(todo.id)}>
                ○
              </Button>
              <Box flexGrow={1}>
                <Text wrap="truncate-end" dimColor={group === 'someday'}>
                  {todo.text}
                </Text>
              </Box>
              {todo.date !== null && <Text color={GROUP_COLOR[group]}>{shortDate(todo.date, today)}</Text>}
            </Box>
          ))}
        </Box>
      ))}
      {arc.kind === 'loaded' && todos.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>no open todos</Text>
        </Box>
      )}
      {context !== null && (
        <Box marginTop={1}>
          <Text dimColor wrap="truncate-end">
            ↳ in focus: sc-{String(context.story.id)} {context.story.name ?? ''}
          </Text>
        </Box>
      )}
      <ArcStatus ui={ui} arc={arc} />
      <Footer ui={ui} mode="overview" actions={actions} />
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
