FROM node:9-alpine

ENV PORT=8080
EXPOSE ${PORT}

ADD . /app
WORKDIR /app

RUN npm install -g nodemon
RUN npm install

CMD ["npm", "start"]
