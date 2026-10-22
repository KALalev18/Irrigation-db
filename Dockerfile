FROM node:22-alpine AS base
WORKDIR /app
# Prisma's query engine needs OpenSSL on Alpine
RUN apk add --no-cache openssl

FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
# postinstall runs prisma generate, so the schema has to be copied first
RUN npm ci --omit=dev

FROM base AS build
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY public ./public

RUN mkdir -p logs && chown node:node logs
USER node

EXPOSE 3000
# Apply any pending migrations, then start the API
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
