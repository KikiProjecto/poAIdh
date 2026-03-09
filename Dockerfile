FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy source
COPY src/ ./src/
COPY .env.example ./

# State file lives in a named volume for persistence across restarts
VOLUME ["/app/state"]
ENV STATE_FILE=/app/state/bot-state.json

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=10s \
  CMD node -e "require('fs').existsSync(process.env.STATE_FILE) ? process.exit(0) : process.exit(1)"

CMD ["node", "src/index.js"]
