# Multi-stage build for production optimization
FROM node:22-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Development
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# Build
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
