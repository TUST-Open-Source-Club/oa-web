<script setup lang="ts">
/** 门户主布局：左侧模块导航 + 顶栏 + 内容区。 */
import { Button } from '@club-oa/ui'

const auth = useAuthStore()
const router = useRouter()

const navItems = [
  { to: '/', label: '工作台' },
  { to: '/im', label: '消息' },
  { to: '/tasks', label: '任务' },
  { to: '/docs', label: '文档' },
  { to: '/meet', label: '会议' },
  { to: '/events', label: '活动' },
  { to: '/drive', label: '网盘' },
  { to: '/notifications', label: '通知' },
]

/** 退出登录并回到登录页。 */
async function onLogout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="hidden w-56 shrink-0 border-r border-neutral-200 bg-white px-3 py-4 md:block dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-6 px-2 text-lg font-semibold text-primary-700 dark:text-primary-300">
        {{ $config.public.appName }}
      </div>
      <nav class="space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="block rounded-[var(--radius-field)] px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          active-class="bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="text-sm text-neutral-500">{{ auth.user?.nickname ?? '' }}</div>
        <div class="flex items-center gap-2">
          <NuxtLink to="/settings" class="text-sm text-neutral-500 hover:text-neutral-800">设置</NuxtLink>
          <Button variant="ghost" size="sm" @click="onLogout">退出</Button>
        </div>
      </header>
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
