FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NEXT_PUBLIC_BACKEND_URL=https://codeinterview-engine.onrender.com/

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]