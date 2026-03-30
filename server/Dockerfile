FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY shared/ ./shared/
COPY server/ ./server/

RUN bun install --production

RUN useradd -r -s /bin/false appuser
USER appuser

EXPOSE 3001

CMD ["bun", "run", "server/index.ts"]
