# Multi-stage Dockerfile for a minimal Node.js app

# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm ci --only=production || npm install --production
COPY app/ .

# Runtime stage
FROM node:18-alpine
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
