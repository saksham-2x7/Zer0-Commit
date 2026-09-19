# ---------- Stage 1: build the React frontend ----------
FROM node:22-alpine AS build
WORKDIR /app

# Vite build-time API base URL. Default "" keeps the runtime model
# (VITE_API_BASE_URL read at build time); pass
#   --build-arg VITE_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/Prod
# for a production-flavoured build, or inject it at runtime instead.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend
RUN cd frontend && npm run build

# ---------- Stage 2: runtime (backend API only) ----------
# The backend deliberately serves NO static files: the built frontend is
# copied in for reference but is served by Vite dev or CloudFront, not this
# container (see README "Deployment"). Does not use Lambda runtime — this is
# the local dev server, which only needs the root package.json deps (@aws-sdk/*).
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV MOCK_BEDROCK=true
ENV PORT=3000

# Root package.json holds all backend deps; frontend deps are build-only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./backend
COPY --from=build /app/frontend/dist ./frontend/dist

# Non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

# devServer returns 404 JSON for GET / (no route), which is the healthy signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===404?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/api/devServer.js"]