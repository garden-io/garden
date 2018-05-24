FROM node:9-alpine

ENV PORT=8080
EXPOSE ${PORT}

RUN npm install

ADD . /app
WORKDIR /app

CMD ["npm", "start"]
