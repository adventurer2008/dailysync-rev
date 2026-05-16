FROM node:18-alpine3.19
WORKDIR /app
RUN apk add --no-cache python3 py3-pip && corepack enable && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
COPY package.json yarn.lock* tsconfig.json requirements.txt ./
RUN yarn --frozen-lockfile
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt
COPY src ./src
COPY scripts ./scripts
VOLUME /app/db
CMD ["yarn", "sync_cn"]
