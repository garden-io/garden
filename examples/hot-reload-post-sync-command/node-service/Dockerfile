FROM node:9-alpine

ENV PORT=8080
EXPOSE ${PORT}

RUN npm install -g nodemon

ADD . /app
WORKDIR /app

RUN npm install

CMD ["npm", "start"]
