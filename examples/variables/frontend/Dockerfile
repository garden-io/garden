FROM node:12.22.6-alpine

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

ADD package.json /app
RUN npm install

ADD . /app

CMD ["npm", "start"]
