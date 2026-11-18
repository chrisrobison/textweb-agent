FROM node:20-bookworm-slim

WORKDIR /app

# Copy the lockfile and use `npm ci` so image builds install exactly the
# audited, pinned dependency tree instead of re-resolving ranges on every build.
COPY package.json package-lock.json tsconfig.json ./
COPY packages/client/package.json ./packages/client/package.json

RUN npm ci
RUN npx playwright install chromium

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
