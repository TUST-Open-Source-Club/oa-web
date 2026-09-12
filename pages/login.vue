<script setup lang="ts">
/** 登录页：账号密码登录（账号由管理员创建）。 */
import { Button, Card, Input } from '@club-oa/ui'
import { ApiError } from '@club-oa/core'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const identifier = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

/** 提交登录；成功后跳转来源页或工作台。 */
async function onSubmit() {
  if (loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    await auth.login(identifier.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  } catch (error) {
    if (error instanceof ApiError) {
      errorMessage.value =
        error.code === 'AUTH_PENDING_ACTIVATION' ? '账号待激活，请先完成邮箱激活' : error.message
    } else {
      errorMessage.value = '网络异常，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Card>
    <h2 class="mb-1 text-lg font-semibold">登录</h2>
    <p class="mb-6 text-sm text-neutral-500">账号由管理员创建，首次使用请通过邮件激活。</p>
    <form class="space-y-4" @submit.prevent="onSubmit">
      <Input v-model="identifier" label="用户名或邮箱" placeholder="alice / alice@club.example.com" autocomplete="username" />
      <Input v-model="password" label="密码" type="password" autocomplete="current-password" />
      <p v-if="errorMessage" role="alert" class="text-sm text-danger-500">{{ errorMessage }}</p>
      <Button type="submit" block :loading="loading">登录</Button>
    </form>
  </Card>
</template>
