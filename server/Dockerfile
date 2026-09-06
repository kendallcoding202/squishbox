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
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
