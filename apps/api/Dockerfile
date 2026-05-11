FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig*.json ./

RUN npm install --include=dev --legacy-peer-deps
RUN npm run build --workspace @hcs/id-scanner-api

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start", "--workspace", "@hcs/id-scanner-api"]
