# 海技試験ナビ コンテナ
#  Node(サーバー/SPA) + benkyo(Python CLI) を同梱。
#  benkyo のDBはホストからマウント（docker-compose 参照）。
FROM node:22-slim

# benkyo（Python CLI）と依存
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir --break-system-packages "benkyo==0.4.8"

WORKDIR /app

# 依存（本番のみ）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# アプリ本体
COPY . .

ENV PORT=8080
ENV DATA_DIR=/data/app
EXPOSE 8080

CMD ["node", "server/server.mjs"]
