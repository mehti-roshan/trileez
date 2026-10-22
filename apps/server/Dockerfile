FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://package-mirror.liara.ir/repository/npm/
RUN npm config set registry "$NPM_REGISTRY" --global
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://package-mirror.liara.ir/repository/npm/
RUN npm config set registry "$NPM_REGISTRY" --global
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/start.js"]
