/**
 * 全局路由守卫：未登录跳转登录页；已登录访问登录页则回工作台。
 * `restore()` 只执行一次（store.ready 标记），避免每次导航都请求。
 */
const publicPages = ['/login', '/activate', '/reset']

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) {
    await auth.restore()
  }
  const isPublic = publicPages.includes(to.path)
  if (!isPublic && !auth.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (isPublic && auth.isAuthenticated) {
    return navigateTo('/')
  }
})
