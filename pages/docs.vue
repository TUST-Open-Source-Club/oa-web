<script setup lang="ts">
/** 文档页：空间 → 树 → Markdown 编辑（乐观锁保存）→ 版本历史与回滚。 */
import { Button, Card } from '@club-oa/ui'

interface SpaceItem {
  id: string
  name: string
  type: string
}
interface NodeItem {
  id: string
  parentId: string | null
  kind: 'folder' | 'page'
  title: string
  version: number
  children?: NodeItem[]
}
interface NodeDetail {
  id: string
  title: string
  version: number
  contentMd: string
}
interface VersionItem {
  version: number
  createdAt: string
}

const auth = useAuthStore()

const spaces = ref<SpaceItem[]>([])
const spaceId = ref('')
const tree = ref<NodeItem[]>([])
const current = ref<NodeDetail | null>(null)
const draft = ref('')
const versions = ref<VersionItem[]>([])
const saving = ref(false)
const message = ref('')
const newTitle = ref('')
const newKind = ref<'page' | 'folder'>('page')

/** 带鉴权的 API 请求。 */
function api<T>(path: string, options: Record<string, unknown> = {}) {
  return $fetch<T>(`/api/doc/${path}`, {
    ...options,
    headers: { ...auth.authHeaders(), ...(options.headers as Record<string, string> | undefined) },
  })
}

/** 加载空间与树。 */
async function loadSpaces() {
  spaces.value = await api<SpaceItem[]>('spaces')
  if (spaces.value.length > 0 && !spaceId.value) spaceId.value = spaces.value[0].id
  if (spaceId.value) tree.value = await api<NodeItem[]>(`spaces/${spaceId.value}/tree`)
}

/** 选择页面。 */
async function openPage(node: NodeItem) {
  if (node.kind !== 'page') return
  current.value = await api<NodeDetail>(`spaces/${spaceId.value}/nodes/${node.id}`)
  draft.value = current.value.contentMd
  versions.value = await api<VersionItem[]>(`spaces/${spaceId.value}/nodes/${node.id}/versions`)
  message.value = ''
}

/** 新建页面/文件夹（根目录）。 */
async function createNode() {
  const title = newTitle.value.trim()
  if (!title) return
  message.value = ''
  try {
    await api(`spaces/${spaceId.value}/nodes`, {
      method: 'POST',
      body: { kind: newKind.value, title },
    })
    newTitle.value = ''
    await loadSpaces()
  } catch (error) {
    message.value = (error as Error).message
  }
}

/** 保存（乐观锁）。 */
async function save() {
  if (!current.value) return
  saving.value = true
  message.value = ''
  try {
    const result = await api<{ version: number }>(
      `spaces/${spaceId.value}/nodes/${current.value.id}/content`,
      { method: 'PUT', body: { contentMd: draft.value, baseVersion: current.value.version } },
    )
    current.value.version = result.version
    message.value = `已保存（v${result.version}）`
    versions.value = await api<VersionItem[]>(
      `spaces/${spaceId.value}/nodes/${current.value.id}/versions`,
    )
  } catch (error) {
    message.value = (error as Error).message || '保存失败（可能已被他人修改）'
  } finally {
    saving.value = false
  }
}

/** 回滚到历史版本。 */
async function restore(version: number) {
  if (!current.value) return
  await api(`spaces/${spaceId.value}/nodes/${current.value.id}/versions/${version}/restore`, {
    method: 'POST',
  })
  await openPage({ id: current.value.id, parentId: null, kind: 'page', title: current.value.title, version: 0 })
}

/** 扁平渲染树（带缩进）。 */
const flatTree = computed(() => {
  const rows: Array<{ node: NodeItem; depth: number }> = []
  const walk = (items: NodeItem[], depth: number) => {
    for (const item of items) {
      rows.push({ node: item, depth })
      if (item.children?.length) walk(item.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return rows
})

onMounted(loadSpaces)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">文档</h1>
      <div class="flex items-center gap-2">
        <select v-model="spaceId" class="rounded-[var(--radius-field)] border border-neutral-300 px-3 py-2 text-sm" @change="loadSpaces">
          <option v-for="space in spaces" :key="space.id" :value="space.id">{{ space.name }}</option>
        </select>
        <select v-model="newKind" class="rounded-[var(--radius-field)] border border-neutral-300 px-2 py-2 text-sm">
          <option value="page">页面</option>
          <option value="folder">文件夹</option>
        </select>
        <input
          v-model="newTitle"
          placeholder="标题"
          class="w-40 rounded-[var(--radius-field)] border border-neutral-300 px-3 py-2 text-sm"
          @keyup.enter="createNode"
        />
        <Button size="sm" @click="createNode">新建</Button>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card class="space-y-1">
        <button
          v-for="row in flatTree"
          :key="row.node.id"
          class="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-neutral-100"
          :style="{ paddingLeft: `${row.depth * 12 + 8}px` }"
          :class="current?.id === row.node.id ? 'bg-primary-50 text-primary-700' : ''"
          @click="openPage(row.node)"
        >
          {{ row.node.kind === 'folder' ? '[目录]' : '[文档]' }} {{ row.node.title }}
        </button>
        <p v-if="flatTree.length === 0" class="py-3 text-center text-xs text-neutral-400">暂无文档</p>
      </Card>

      <Card v-if="current" class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ current.title }} <span class="text-xs text-neutral-400">v{{ current.version }}</span></h2>
          <Button size="sm" :loading="saving" @click="save">保存</Button>
        </div>
        <p v-if="message" class="text-sm text-neutral-500">{{ message }}</p>
        <textarea
          v-model="draft"
          rows="18"
          class="w-full rounded-[var(--radius-field)] border border-neutral-300 p-3 font-mono text-sm focus:border-primary-500 focus:outline-none"
          placeholder="# 开始编写 Markdown…"
        />
        <details class="text-sm">
          <summary class="cursor-pointer text-neutral-500">历史版本（{{ versions.length }}）</summary>
          <div class="mt-2 space-y-1">
            <div v-for="item in versions" :key="item.version" class="flex items-center justify-between">
              <span class="text-neutral-500">v{{ item.version }} · {{ new Date(item.createdAt).toLocaleString() }}</span>
              <Button variant="ghost" size="sm" @click="restore(item.version)">回滚</Button>
            </div>
          </div>
        </details>
      </Card>
      <Card v-else class="text-sm text-neutral-400">从左侧选择或新建页面</Card>
    </div>
  </div>
</template>
