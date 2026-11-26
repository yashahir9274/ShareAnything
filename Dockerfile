# ShareAnything: one Node process serving Next.js + Socket.io + file storage.
# Notes and uploaded files live in /app/.data; mount a volume there so they survive redeploys.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/next.config.ts /app/tsconfig.json ./

RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
VOLUME ["/app/.data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "server/index.ts", "--prod"]
