FROM node:18-alpine

WORKDIR /app

COPY app/ .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
