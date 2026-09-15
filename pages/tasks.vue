<script setup lang="ts">
/** 任务看板：项目/列/任务，支持指派负责人、优先级、截止时间与拖拽换列。 */
import { Button, Input } from '@club-oa/ui'

/** 项目。 */
interface ProjectItem {
  id: string
  name: string
}
/** 看板列。 */
interface ColumnItem {
  id: string
  name: string
  position: number
  isDone: boolean
}
/** 任务。 */
interface TaskItem {
  id: string
  columnId: string
  title: string
  descriptionMd: string | null
  assigneeId: string | null
  priority: string
  dueAt: string | null
  completedAt: string | null
}
/** 用户。 */
interface UserItem {
  id: string
  username: string
  nickname: string
  department: string | null
}

const auth = useAuthStore()
const projects = ref<ProjectItem[]>([])
const projectId = ref('')
const columns = ref<ColumnItem[]>([])
const tasks = ref<TaskItem[]>([])
const users = ref<Record<string, UserItem>>({})
const newProjectName = ref('')
const message = ref('')
const draggingId = ref('')
const dropTarget = ref('')

const priorities = [
  { value: 'low', label: '低', dot: 'bg-neutral-300' },
  { value: 'normal', label: '普通', dot: 'bg-info-500' },
  { value: 'high', label: '高', dot: 'bg-warning-500' },
  { value: 'urgent', label: '紧急', dot: 'bg-danger-500' },
]

const createOpen = ref(false)
const creating = ref(false)
const draft = reactive({
  title: '',
  columnId: '',
  priority: 'normal',
  assigneeId: null as string | null,
  dueAt: '',
})
const assignOpen = ref(false)
const assignTarget = ref<TaskItem | null>(null)
const assignValue = ref<string | null>(null)

/** 带鉴权的 API 请求。 */
function api<T>(path: string, options: Record<string, unknown> = {}) {
  return $fetch<T>(`/api/task/${path}`, {
    ...options,
    headers: {
      ...auth.authHeaders(),
      ...((options.headers as Record<string, string> | undefined) ?? {}),
    },
  })
}

/** 列内任务。 */
function tasksOf(columnId: string) {
  return tasks.value.filter((task) => task.columnId === columnId)
}

/** 优先级元数据。 */
function priorityOf(value: string) {
  return priorities.find((item) => item.value === value) ?? priorities[1]
}

/** 批量解析用户昵称。 */
async function resolveUsers(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => id && !users.value[id])
  if (missing.length === 0) return
  try {
    const items = await $fetch<UserItem[]>('/api/auth/users', {
      params: { ids: missing.join(',') },
      headers: auth.authHeaders(),
    })
    for (const user of items) users.value[user.id] = user
  } catch {
    // 昵称解析失败不影响看板
  }
}

/** 加载项目并选中。 */
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
  await resolveUsers(list.map((task) => task.assigneeId ?? ''))
}

/** 打开新建任务弹窗。 */
function openCreate(columnId?: string) {
  draft.title = ''
  draft.priority = 'normal'
  draft.assigneeId = null
  draft.dueAt = ''
  draft.columnId = columnId ?? columns.value[0]?.id ?? ''
  createOpen.value = true
}

/** 创建任务。 */
async function createTask() {
  const title = draft.title.trim()
  if (!title || !draft.columnId) return
  creating.value = true
  message.value = ''
  try {
    await api(`projects/${projectId.value}/tasks`, {
      method: 'POST',
      body: {
        columnId: draft.columnId,
        title,
        priority: draft.priority,
        assigneeId: draft.assigneeId ?? undefined,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : undefined,
      },
    })
    createOpen.value = false
    await loadBoard()
  } catch (error) {
    message.value = apiErrorMessage(error)
  } finally {
    creating.value = false
  }
}

/** 拖拽换列。 */
async function onDrop(columnId: string) {
  dropTarget.value = ''
  const task = tasks.value.find((item) => item.id === draggingId.value)
  draggingId.value = ''
  if (!task || task.columnId === columnId) return
  await api(`tasks/${task.id}/move`, { method: 'POST', body: { columnId } })
  await loadBoard()
}

/** 打开指派弹窗。 */
function openAssign(task: TaskItem) {
  assignTarget.value = task
  assignValue.value = task.assigneeId
  assignOpen.value = true
}

/** 保存指派（null 表示取消指派）。 */
async function saveAssign() {
  const task = assignTarget.value
  if (!task) return
  await api(`tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: assignValue.value } })
  assignOpen.value = false
  await loadBoard()
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
    message.value = apiErrorMessage(error)
  }
}

onMounted(loadProjects)
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">任务</h1>
        <p class="mt-0.5 text-sm text-neutral-400">拖拽卡片可在列之间流转</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="projectId"
          class="rounded-[var(--radius-field)] border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-neutral-700 dark:bg-neutral-900"
          @change="loadBoard"
        >
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
        <Input v-model="newProjectName" placeholder="新项目名称" class="max-w-40" />
        <Button variant="secondary" size="sm" @click="createProject">新建项目</Button>
        <Button v-if="projectId" size="sm" @click="openCreate()">
          <AppIcon name="plus" class="size-4" /> 新建任务
        </Button>
      </div>
    </div>

    <p v-if="message" role="alert" class="text-sm text-danger-500">{{ message }}</p>

    <div v-if="columns.length" class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      <section
        v-for="column in columns"
        :key="column.id"
        class="rounded-[var(--radius-card)] border bg-neutral-100/60 p-3 transition dark:bg-neutral-900/60"
        :class="
          dropTarget === column.id
            ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/20'
            : 'border-neutral-200 dark:border-neutral-800'
        "
        @dragover.prevent="dropTarget = column.id"
        @dragleave="dropTarget === column.id && (dropTarget = '')"
        @drop="onDrop(column.id)"
      >
        <div class="mb-2 flex items-center justify-between px-1">
          <h2 class="flex items-center gap-2 text-sm font-semibold">
            {{ column.name }}
            <span class="rounded-full bg-neutral-200 px-1.5 text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800">
              {{ tasksOf(column.id).length }}
            </span>
          </h2>
          <button
            class="rounded p-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-800"
            aria-label="添加任务"
            @click="openCreate(column.id)"
          >
            <AppIcon name="plus" class="size-4" />
          </button>
        </div>
        <div class="space-y-2">
          <article
            v-for="task in tasksOf(column.id)"
            :key="task.id"
            draggable="true"
            class="cursor-grab rounded-[var(--radius-field)] border border-neutral-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing dark:border-neutral-800 dark:bg-neutral-900"
            :class="draggingId === task.id ? 'opacity-50' : ''"
            @dragstart="draggingId = task.id"
            @dragend="draggingId = ''"
          >
            <div class="flex items-start gap-2">
              <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="priorityOf(task.priority).dot" />
              <div class="min-w-0 flex-1">
                <p class="text-sm leading-5" :class="task.completedAt ? 'text-neutral-400 line-through' : ''">
                  {{ task.title }}
                </p>
                <p v-if="task.descriptionMd" class="mt-1 line-clamp-2 text-xs text-neutral-400">
                  {{ task.descriptionMd }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    class="inline-flex items-center gap-1.5 rounded-full border border-dashed px-1.5 py-0.5 text-xs transition"
                    :class="
                      task.assigneeId
                        ? 'border-transparent bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                        : 'border-neutral-300 text-neutral-400 hover:border-primary-400 hover:text-primary-600'
                    "
                    @click="openAssign(task)"
                  >
                    <template v-if="task.assigneeId">
                      <UserAvatar
                        :name="users[task.assigneeId]?.nickname"
                        :seed="task.assigneeId"
                        size="sm"
                      />
                      {{ users[task.assigneeId]?.nickname ?? '加载中…' }}
                    </template>
                    <template v-else>
                      <AppIcon name="users" class="size-3.5" /> 指派
                    </template>
                  </button>
                  <span
                    v-if="task.dueAt"
                    class="inline-flex items-center gap-1 text-[11px]"
                    :class="
                      !task.completedAt && new Date(task.dueAt) < new Date()
                        ? 'text-danger-500'
                        : 'text-neutral-400'
                    "
                  >
                    <AppIcon name="calendar" class="size-3.5" />
                    {{ new Date(task.dueAt).toLocaleDateString('zh-CN') }}
                  </span>
                </div>
              </div>
            </div>
          </article>
          <p
            v-if="tasksOf(column.id).length === 0"
            class="rounded-[var(--radius-field)] border border-dashed border-neutral-300 py-6 text-center text-xs text-neutral-400 dark:border-neutral-700"
          >
            拖拽任务到这里
          </p>
        </div>
      </section>
    </div>

    <div
      v-else
      class="rounded-[var(--radius-card)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400 dark:border-neutral-700"
    >
      创建或选择一个项目开始使用看板
    </div>

    <!-- 新建任务 -->
    <AppModal :open="createOpen" title="新建任务" @close="createOpen = false">
      <div class="space-y-4">
        <label class="block text-sm">
          <span class="mb-1 block text-xs text-neutral-500">标题</span>
          <Input v-model="draft.title" placeholder="要做什么？" @keyup.enter="createTask" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">
            <span class="mb-1 block text-xs text-neutral-500">所在列</span>
            <select
              v-model="draft.columnId"
              class="w-full rounded-[var(--radius-field)] border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            >
              <option v-for="column in columns" :key="column.id" :value="column.id">
                {{ column.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-xs text-neutral-500">优先级</span>
            <select
              v-model="draft.priority"
              class="w-full rounded-[var(--radius-field)] border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            >
              <option v-for="item in priorities" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
        </div>
        <div>
          <span class="mb-1 block text-xs text-neutral-500">负责人</span>
          <UserPicker v-model="draft.assigneeId" placeholder="搜索并选择负责人（可留空）" />
        </div>
        <label class="block text-sm">
          <span class="mb-1 block text-xs text-neutral-500">截止时间</span>
          <input
            v-model="draft.dueAt"
            type="date"
            class="w-full rounded-[var(--radius-field)] border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </label>
      </div>
      <template #footer>
        <Button variant="secondary" @click="createOpen = false">取消</Button>
        <Button :disabled="!draft.title.trim() || creating" @click="createTask">
          {{ creating ? '创建中…' : '创建' }}
        </Button>
      </template>
    </AppModal>

    <!-- 指派负责人 -->
    <AppModal :open="assignOpen" title="指派负责人" @close="assignOpen = false">
      <UserPicker v-model="assignValue" placeholder="搜索并选择负责人" />
      <template #footer>
        <Button variant="secondary" @click="assignOpen = false">取消</Button>
        <Button @click="saveAssign">保存</Button>
      </template>
    </AppModal>
  </div>
</template>
