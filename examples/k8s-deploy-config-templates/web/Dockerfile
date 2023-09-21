FROM node:16.18.1-alpine

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm install
COPY . /app

CMD ["npm", "run", "serve"]
