# 海技試験ナビ コンテナ
#  Node(サーバー/SPA) + benkyo(Python CLI) を同梱。
#  benkyo のDBはホストからマウント（docker-compose 参照）。
#
#  注意: benkyo は Python >=3.12 が必要。node:22-slim(bookworm)のPythonは3.11なので、
#        uv で管理下のPython3.12を取得して benkyo を導入する（ベースのPython版に非依存）。
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# uv（Pythonを自前管理）→ benkyo を Python3.12 で導入。shim は /root/.local/bin に置かれる。
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv tool install --python 3.12 benkyo \
  && benkyo --version

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
