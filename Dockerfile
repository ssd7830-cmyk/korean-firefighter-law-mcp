FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "build/index.js", "--mode", "http"]
