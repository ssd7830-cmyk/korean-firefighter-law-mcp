FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 TZ=Asia/Seoul
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER node
CMD ["node", "build/index.js", "--mode", "http"]
