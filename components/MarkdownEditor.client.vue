<script setup lang="ts">
/**
 * Milkdown 所见即所得编辑器（仅客户端）。
 * 通过 getMarkdown() 暴露最新 Markdown（listener 持续同步）；初始化失败时回退文本编辑。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

const root = ref<HTMLElement>()
const failed = ref(false)
let editor: { destroy: () => Promise<void> } | null = null
let latest = props.modelValue

onMounted(async () => {
  if (!root.value) return
  try {
    const { Editor, rootCtx, defaultValueCtx } = await import('@milkdown/kit/core')
    const { commonmark } = await import('@milkdown/kit/preset/commonmark')
    const { listener, listenerCtx } = await import('@milkdown/kit/plugin/listener')
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root.value as HTMLElement)
        ctx.set(defaultValueCtx, props.modelValue)
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          latest = markdown
          emit('update:modelValue', markdown)
        })
      })
      .use(commonmark)
      .use(listener)
      .create()
  } catch (error) {
    console.error('Milkdown 初始化失败', error)
    failed.value = true
  }
})

onBeforeUnmount(async () => {
  try {
    await editor?.destroy()
  } catch {
    // 忽略销毁异常
  }
})

/** 读取当前 Markdown（编辑器未就绪时返回原值）。 */
function getMarkdown(): string {
  return latest ?? props.modelValue
}

defineExpose({ getMarkdown, failed })
</script>

<template>
  <div class="rounded-[var(--radius-field)] border border-neutral-300 bg-white">
    <div v-if="failed" class="p-3 text-xs text-danger-500">
      Markdown 编辑器加载失败，请刷新重试或使用下方的纯文本回退。
    </div>
    <div ref="root" class="milkdown-host min-h-72 p-3 [&_.ProseMirror]:min-h-64 [&_.ProseMirror]:outline-none" />
  </div>
</template>
