<script setup lang="ts">
/** 网盘页：空间 → 目录浏览、新建文件夹、上传（服务端中转）、下载、删除。 */
import { Button, Card, Input } from '@club-oa/ui'

interface SpaceItem {
  id: string
  name: string
  type: string
}
interface NodeItem {
  id: string
  parentId: string | null
  name: string
  kind: 'folder' | 'file'
  size: number
  mime: string | null
  createdAt: string
}

const auth = useAuthStore()

const spaces = ref<SpaceItem[]>([])
const spaceId = ref('')
const nodes = ref<NodeItem[]>([])
const folderStack = ref<Array<{ id: string; name: string }>>([])
const newFolderName = ref('')
const uploading = ref(false)
const errorMessage = ref('')

const currentParentId = computed(() => folderStack.value.at(-1)?.id ?? '')

/** 带鉴权的 API 请求。 */
function api<T>(path: string, options: Record<string, unknown> = {}) {
  return $fetch<T>(`/api/drive/${path}`, {
    ...options,
    headers: { ...auth.authHeaders(), ...(options.headers as Record<string, string> | undefined) },
  })
}

/** 加载空间并进入第一个。 */
async function loadSpaces() {
  spaces.value = await api<SpaceItem[]>('spaces')
  if (spaces.value.length > 0 && !spaceId.value) {
    spaceId.value = spaces.value[0].id
  }
}

/** 加载当前目录内容。 */
async function loadNodes() {
  if (!spaceId.value) return
  const query = currentParentId.value ? `?parentId=${currentParentId.value}` : ''
  nodes.value = await api<NodeItem[]>(`spaces/${spaceId.value}/nodes${query}`)
}

/** 进入目录。 */
async function openFolder(node: NodeItem) {
  folderStack.value.push({ id: node.id, name: node.name })
  await loadNodes()
}

/** 返回上级。 */
async function goUp() {
  folderStack.value.pop()
  await loadNodes()
}

/** 新建文件夹。 */
async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  errorMessage.value = ''
  try {
    await api(`spaces/${spaceId.value}/folders`, {
      method: 'POST',
      body: { name, parentId: currentParentId.value || null },
    })
    newFolderName.value = ''
    await loadNodes()
  } catch (error) {
    errorMessage.value = (error as Error).message
  }
}

/** 服务端中转上传（小文件；大文件走分片接口）。 */
async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !spaceId.value) return
  uploading.value = true
  errorMessage.value = ''
  try {
    const query = new URLSearchParams({ name: file.name, mime: file.type || 'application/octet-stream' })
    if (currentParentId.value) query.set('parentId', currentParentId.value)
    await api(`spaces/${spaceId.value}/files?${query.toString()}`, {
      method: 'POST',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    })
    await loadNodes()
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    uploading.value = false
    input.value = ''
  }
}

/** 下载（BFF 代理原始字节）。 */
async function download(node: NodeItem) {
  const response = await fetch(
    `/api/drive/download?spaceId=${spaceId.value}&nodeId=${node.id}`,
    { headers: auth.authHeaders() },
  )
  if (!response.ok) {
    errorMessage.value = '下载失败'
    return
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = node.name
  link.click()
  URL.revokeObjectURL(url)
}

/** 删除（进回收站）。 */
async function remove(node: NodeItem) {
  await api(`spaces/${spaceId.value}/nodes/${node.id}`, { method: 'DELETE' })
  await loadNodes()
}

/** 展示大小。 */
function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(async () => {
  await loadSpaces()
  await loadNodes()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">网盘</h1>
      <select v-model="spaceId" class="rounded-[var(--radius-field)] border border-neutral-300 px-3 py-2 text-sm" @change="folderStack = []; loadNodes()">
        <option v-for="space in spaces" :key="space.id" :value="space.id">{{ space.name }}</option>
      </select>
    </div>

    <p v-if="errorMessage" role="alert" class="text-sm text-danger-500">{{ errorMessage }}</p>

    <Card class="space-y-3">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button class="text-primary-600 hover:underline" @click="folderStack = []; loadNodes()">根目录</button>
        <template v-for="folder in folderStack" :key="folder.id">
          <span>/</span>
          <span class="text-neutral-500">{{ folder.name }}</span>
        </template>
        <Button v-if="folderStack.length" variant="ghost" size="sm" @click="goUp">返回上级</Button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Input v-model="newFolderName" placeholder="新文件夹名称" class="max-w-48" />
        <Button size="sm" @click="createFolder">新建文件夹</Button>
        <label class="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-field)] border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          <input type="file" class="hidden" @change="onUpload" />
          上传文件
        </label>
        <span v-if="uploading" class="text-sm text-neutral-500">上传中…</span>
      </div>

      <div class="divide-y divide-neutral-100">
        <div v-for="node in nodes" :key="node.id" class="flex items-center justify-between py-2 text-sm">
          <div class="flex min-w-0 items-center gap-2">
            <span>{{ node.kind === 'folder' ? '[目录]' : '[文档]' }}</span>
            <button v-if="node.kind === 'folder'" class="truncate hover:text-primary-600" @click="openFolder(node)">
              {{ node.name }}
            </button>
            <span v-else class="truncate">{{ node.name }}</span>
            <span v-if="node.kind === 'file'" class="shrink-0 text-xs text-neutral-400">{{ formatSize(node.size) }}</span>
          </div>
          <div class="flex shrink-0 gap-1">
            <Button v-if="node.kind === 'file'" variant="ghost" size="sm" @click="download(node)">下载</Button>
            <Button variant="ghost" size="sm" @click="remove(node)">删除</Button>
          </div>
        </div>
        <p v-if="nodes.length === 0" class="py-4 text-center text-sm text-neutral-400">空目录</p>
      </div>
    </Card>
  </div>
</template>
