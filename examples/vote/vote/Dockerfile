FROM node:16.18.1-alpine as default

WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
RUN mkdir node_modules/.cache && chmod -R 777 node_modules/.cache
ADD . /app

RUN echo "default" > /.mode
RUN echo "default"

CMD ["npm", "run", "serve"]

FROM default as sync

RUN echo "sync" > /.mode
RUN echo "sync"
