FROM node:10-alpine

WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
ADD . /app

CMD ["npm", "run", "serve"]
