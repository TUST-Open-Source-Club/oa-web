/**
 * 全局路由守卫：未登录跳转登录页；已登录访问登录页则回工作台。
 * 公开前缀（活动报名、分享链接）不要求登录。
 */
const publicPages = ['/login', '/activate', '/reset']
const publicPrefixes = ['/e/', '/s/', '/d/', '/m/']

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) {
    await auth.restore()
  }
  const isPublic =
    publicPages.includes(to.path) || publicPrefixes.some((prefix) => to.path.startsWith(prefix))
  if (!isPublic && !auth.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (publicPages.includes(to.path) && auth.isAuthenticated) {
    return navigateTo('/')
  }
})
