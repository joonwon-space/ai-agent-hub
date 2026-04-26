FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && node src/index.js"
