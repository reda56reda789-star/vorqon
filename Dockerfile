# VORQON — Render image. Build context = REPO ROOT (see render.yaml:
# dockerContext "." + dockerfilePath "./Dockerfile").
# This file exists alongside backend/Dockerfile (kept untouched for
# docker-compose, whose context is ./backend) because the Render image
# must also bundle the SQL files the first-boot DB bootstrap applies
# (backend/src/bootstrap-db.js, enabled by DB_BOOTSTRAP=true):
#   /app/db/schema.sql        <- database/schema.sql
#   /app/db/catalog-repo.sql  <- catalog-10000/catalog-repo.sql
#   /app/db/catalog-images.sql <- catalog-10000/catalog-images.sql
#   /app/db/catalog-prices.sql <- catalog-10000/catalog-prices.sql
#   /app/db/guest-orders.sql   <- database/guest-orders.sql
#   /app/db/cancel-test-order.sql <- database/cancel-test-order.sql
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
COPY database/schema.sql ./db/schema.sql
COPY catalog-10000/catalog-repo.sql ./db/catalog-repo.sql
COPY catalog-10000/catalog-images.sql ./db/catalog-images.sql
COPY catalog-10000/catalog-prices.sql ./db/catalog-prices.sql
COPY database/guest-orders.sql ./db/guest-orders.sql
COPY database/cancel-test-order.sql ./db/cancel-test-order.sql
EXPOSE 3000
# `npm start` runs: node src/bootstrap-db.js && node src/server.js
# (bootstrap is a no-op unless DB_BOOTSTRAP=true).
CMD ["npm", "start"]
