<script setup lang="ts">
/** 任务看板页：项目/列/任务、快速创建、移动换列、完成。 */
import { Button, Card, Input } from '@club-oa/ui'

interface ProjectItem {
  id: string
  name: string
}
interface ColumnItem {
  id: string
  name: string
  position: number
  isDone: boolean
}
interface TaskItem {
  id: string
  columnId: string
  title: string
  assigneeId: string | null
  priority: string
  dueAt: string | null
  completedAt: string | null
}

const auth = useAuthStore()
const projects = ref<ProjectItem[]>([])
const projectId = ref('')
const columns = ref<ColumnItem[]>([])
const tasks = ref<TaskItem[]>([])
const newProjectName = ref('')
const newTaskTitle = ref('')
const newTaskColumn = ref('')
const message = ref('')

/** 带鉴权的 API 请求。 */
function api<T>(path: string, options: Record<string, unknown> = {}) {
  return $fetch<T>(`/api/task/${path}`, {
    ...options,
    headers: { ...auth.authHeaders(), ...(options.headers as Record<string, string> | undefined) },
  })
}

/** 列内任务。 */
function tasksOf(columnId: string) {
  return tasks.value.filter((task) => task.columnId === columnId)
}

/** 加载项目并选中第一个。 */
async function loadProjects() {
  projects.value = await api<ProjectItem[]>('projects')
  if (projects.value.length > 0 && !projectId.value) projectId.value = projects.value[0].id
  if (projectId.value) await loadBoard()
}

/** 加载列与任务。 */
async function loadBoard() {
  const [cols, list] = await Promise.all([
    api<ColumnItem[]>(`projects/${projectId.value}/columns`),
    api<TaskItem[]>(`projects/${projectId.value}/tasks`),
  ])
  columns.value = cols
  tasks.value = list
  if (!newTaskColumn.value && cols.length > 0) newTaskColumn.value = cols[0].id
}

/** 创建项目。 */
async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  message.value = ''
  try {
    const created = await api<{ id: string }>('projects', { method: 'POST', body: { name } })
    newProjectName.value = ''
    projectId.value = created.id
    await loadProjects()
  } catch (error) {
    message.value = (error as Error).message
  }
}

/** 创建任务。 */
async function createTask() {
  const title = newTaskTitle.value.trim()
  if (!title || !newTaskColumn.value) return
  message.value = ''
  try {
    await api(`projects/${projectId.value}/tasks`, {
      method: 'POST',
      body: { columnId: newTaskColumn.value, title, assigneeId: auth.user?.id },
    })
    newTaskTitle.value = ''
    await loadBoard()
  } catch (error) {
    message.value = (error as Error).message
  }
}

/** 移动到指定列。 */
async function moveTask(task: TaskItem, columnId: string) {
  if (columnId === task.columnId) return
  await api(`tasks/${task.id}/move`, { method: 'POST', body: { columnId } })
  await loadBoard()
}

/** 优先级颜色。 */
function priorityClass(priority: string) {
  return (
    {
      urgent: 'bg-danger-500',
      high: 'bg-warning-500',
      low: 'bg-neutral-300',
      normal: 'bg-info-500',
    }[priority] ?? 'bg-neutral-300'
  )
}

onMounted(loadProjects)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">任务看板</h1>
      <div class="flex items-center gap-2">
        <select v-model="projectId" class="rounded-[var(--radius-field)] border border-neutral-300 px-3 py-2 text-sm" @change="loadBoard">
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <Input v-model="newProjectName" placeholder="新项目名称" class="max-w-40" />
        <Button size="sm" @click="createProject">新建项目</Button>
      </div>
    </div>

    <p v-if="message" role="alert" class="text-sm text-danger-500">{{ message }}</p>

    <Card v-if="projectId" class="flex flex-wrap items-center gap-2">
      <Input v-model="newTaskTitle" placeholder="任务标题" class="max-w-64" @keyup.enter="createTask" />
      <select v-model="newTaskColumn" class="rounded-[var(--radius-field)] border border-neutral-300 px-3 py-2 text-sm">
        <option v-for="column in columns" :key="column.id" :value="column.id">{{ column.name }}</option>
      </select>
      <Button size="sm" @click="createTask">添加任务</Button>
    </Card>

    <div v-if="columns.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card v-for="column in columns" :key="column.id" class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            {{ column.name }}
            <span class="ml-1 text-xs font-normal text-neutral-400">{{ tasksOf(column.id).length }}</span>
          </h2>
        </div>
        <div class="space-y-2">
          <div v-for="task in tasksOf(column.id)" :key="task.id" class="rounded-[var(--radius-field)] border border-neutral-200 p-2 text-sm">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="size-2 shrink-0 rounded-full" :class="priorityClass(task.priority)" />
                  <span class="truncate" :class="task.completedAt ? 'text-neutral-400 line-through' : ''">{{ task.title }}</span>
                </div>
                <div class="mt-1 text-xs text-neutral-400">
                  {{ task.assigneeId ? '已指派' : '未指派' }}
                  <span v-if="task.dueAt"> · 截止 {{ new Date(task.dueAt).toLocaleDateString() }}</span>
                </div>
              </div>
              <select
                class="shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-xs"
                :value="task.columnId"
                @change="moveTask(task, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="target in columns" :key="target.id" :value="target.id">{{ target.name }}</option>
              </select>
            </div>
          </div>
          <p v-if="tasksOf(column.id).length === 0" class="py-2 text-center text-xs text-neutral-300">空</p>
        </div>
      </Card>
    </div>

    <Card v-else class="text-sm text-neutral-400">创建或选择一个项目开始使用看板</Card>
  </div>
</template>
