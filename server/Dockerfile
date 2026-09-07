# Build the trading post with the repo's own toolchain, then run it on a slim Node image.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./server/dist
# Deliberately still root. Fly mounts the data volume as root-owned 0755 (see the boot log:
# "Mounting /dev/vdc at /data w/ uid: 0, gid: 0"), so USER node cannot open the SQLite file
# and the service dies on start. Dropping privileges needs the mount ownership handled first.
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
