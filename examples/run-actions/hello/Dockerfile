FROM node:18.16.0-alpine

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

ADD package.json /app
RUN npm install knex -g
RUN npm install

ADD . /app

CMD ["npm", "start"]
