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
const showTrash = ref(false)
const trashed = ref<NodeItem[]>([])
const shareDialog = ref<{ node: NodeItem; password: string; shareId: string; url: string } | null>(null)

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
  if (showTrash.value) {
    trashed.value = await api<NodeItem[]>(`spaces/${spaceId.value}/nodes?trashed=true`)
    return
  }
  const query = currentParentId.value ? `?parentId=${currentParentId.value}` : ''
  nodes.value = await api<NodeItem[]>(`spaces/${spaceId.value}/nodes${query}`)
}

/** 切换回收站视图。 */
async function toggleTrash() {
  showTrash.value = !showTrash.value
  await loadNodes()
}

/** 从回收站恢复。 */
async function restore(node: NodeItem) {
  await api(`spaces/${spaceId.value}/nodes/${node.id}/restore`, { method: 'POST' })
  await loadNodes()
}

/** 打开分享对话框。 */
function openShare(node: NodeItem) {
  shareDialog.value = { node, password: '', shareId: '', url: '' }
}

/** 创建分享链接。 */
async function createShare() {
  if (!shareDialog.value) return
  errorMessage.value = ''
  try {
    const body: Record<string, unknown> = {}
    if (shareDialog.value.password.trim()) body.password = shareDialog.value.password.trim()
    const result = await api<{ id: string; token: string; url: string }>(
      `spaces/${spaceId.value}/nodes/${shareDialog.value.node.id}/shares`,
      { method: 'POST', body },
    )
    shareDialog.value.shareId = result.id
    shareDialog.value.url = `${window.location.origin}${result.url}`
  } catch (error) {
    errorMessage.value = (error as Error).message
  }
}

/** 吊销分享。 */
async function revokeShare() {
  if (!shareDialog.value?.shareId) return
  await api(`spaces/${spaceId.value}/shares/${shareDialog.value.shareId}`, { method: 'DELETE' })
  shareDialog.value = null
}

/** 复制分享链接。 */
async function copyShare() {
  if (!shareDialog.value?.url) return
  await navigator.clipboard.writeText(shareDialog.value.url)
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

/**
 * 上传文件：优先 S3 预签名直传（不经过应用服务器）；
 * 后端不支持预签名（本地存储）时回退服务端中转。
 */
async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !spaceId.value) return
  uploading.value = true
  errorMessage.value = ''
  const mime = file.type || 'application/octet-stream'
  try {
    let presign: { storageKey: string; uploadUrl: string } | null = null
    try {
      presign = await api<{ storageKey: string; uploadUrl: string }>(
        `spaces/${spaceId.value}/files/presign`,
        {
          method: 'POST',
          body: {
            name: file.name,
            mime,
            size: file.size,
            parentId: currentParentId.value || undefined,
          },
        },
      )
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code
      if (code !== 'DRIVE_PRESIGN_UNSUPPORTED') throw error
    }

    if (presign) {
      // 直传对象存储
      const putResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': mime },
      })
      if (!putResponse.ok) throw new Error(`直传失败（${putResponse.status}）`)
      await api(`spaces/${spaceId.value}/files/complete`, {
        method: 'POST',
        body: {
          storageKey: presign.storageKey,
          name: file.name,
          mime,
          size: file.size,
          parentId: currentParentId.value || undefined,
        },
      })
    } else {
      const query = new URLSearchParams({ name: file.name, mime })
      if (currentParentId.value) query.set('parentId', currentParentId.value)
      await api(`spaces/${spaceId.value}/files?${query.toString()}`, {
        method: 'POST',
        body: file,
        headers: { 'content-type': mime },
      })
    }
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

/** 预览 Office 文档（docx/xlsx/pptx/pdf 等）。 */
function preview(node: NodeItem) {
  navigateTo(`/office/${node.id}?spaceId=${spaceId.value}`)
}

/** 是否需要 Office 预览按钮。 */
function canPreview(node: NodeItem) {
  if (node.kind !== 'file') return false
  const ext = node.name.rsplit('.', 1)[1]?.toLowerCase() ?? ''
  return ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'pdf'].includes(ext)
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
        <Button variant="ghost" size="sm" @click="toggleTrash">
          {{ showTrash ? '返回文件' : '回收站' }}
        </Button>
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
            <Button v-if="canPreview(node)" variant="ghost" size="sm" @click="preview(node)">预览</Button>
            <Button v-if="node.kind === 'file'" variant="ghost" size="sm" @click="download(node)">下载</Button>
            <Button variant="ghost" size="sm" @click="openShare(node)">分享</Button>
            <Button variant="ghost" size="sm" @click="remove(node)">删除</Button>
          </div>
        </div>
        <p v-if="!showTrash && nodes.length === 0" class="py-4 text-center text-sm text-neutral-400">空目录</p>
      </div>

      <div v-if="showTrash" class="divide-y divide-neutral-100">
        <div v-for="node in trashed" :key="node.id" class="flex items-center justify-between py-2 text-sm">
          <span class="truncate text-neutral-500">{{ node.name }}</span>
          <Button variant="ghost" size="sm" @click="restore(node)">恢复</Button>
        </div>
        <p v-if="trashed.length === 0" class="py-4 text-center text-sm text-neutral-400">回收站为空</p>
      </div>
    </Card>

    <Card v-if="shareDialog" class="space-y-3">
      <h2 class="text-sm font-semibold">分享「{{ shareDialog.node.name }}」</h2>
      <div class="flex flex-wrap items-center gap-2">
        <Input v-model="shareDialog.password" type="password" placeholder="访问密码（可选，4~64 位）" class="max-w-60" />
        <Button v-if="!shareDialog.shareId" size="sm" @click="createShare">生成链接</Button>
        <template v-else>
          <code class="max-w-full truncate rounded bg-neutral-100 px-2 py-1 text-xs">{{ shareDialog.url }}</code>
          <Button size="sm" variant="secondary" @click="copyShare">复制</Button>
          <Button size="sm" variant="danger" @click="revokeShare">吊销</Button>
        </template>
        <Button size="sm" variant="ghost" @click="shareDialog = null">关闭</Button>
      </div>
    </Card>
  </div>
</template>
