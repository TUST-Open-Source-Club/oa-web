# 构建阶段：Nuxt 3 SSR 产物（packages 为仓库内嵌子模块 oa-fe-libs）
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# 运行阶段
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
