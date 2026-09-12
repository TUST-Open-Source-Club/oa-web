<script setup lang="ts">
/** 工作台（M1 占位）：展示登录用户信息与后续模块入口。 */
import { Card } from '@club-oa/ui'

const auth = useAuthStore()
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">你好，{{ auth.user?.nickname }}</h1>
    <Card>
      <p class="text-sm text-neutral-500">
        工作台模块（待办、未读消息、近期会议与活动）将在后续里程碑接入。
      </p>
    </Card>
  </div>
</template>
