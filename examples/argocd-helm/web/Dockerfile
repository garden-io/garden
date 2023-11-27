FROM node:10-alpine

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm install
COPY . /app

CMD ["npm", "run", "serve"]
