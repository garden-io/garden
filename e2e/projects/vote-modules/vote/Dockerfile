FROM node:16.18.1-alpine

WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
RUN mkdir node_modules/.cache && chmod -R 777 node_modules/.cache
ADD . /app

CMD ["npm", "run", "serve"]
