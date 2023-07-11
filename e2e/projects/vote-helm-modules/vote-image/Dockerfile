FROM node:16.18.1-alpine

WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
ADD . /app

CMD ["npm", "run", "serve"]
