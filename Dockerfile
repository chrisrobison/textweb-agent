FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.json .
COPY packages/client/package.json ./packages/client/package.json

RUN npm install
RUN npx playwright install chromium

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
