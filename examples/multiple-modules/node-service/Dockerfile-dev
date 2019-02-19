FROM node:9-alpine

ENV PORT=8080
ENV ENVIRONMENT=dev
ENV HELLO_PATH=/hello-dev
EXPOSE ${PORT}
WORKDIR /app

ADD package.json /app
RUN npm install

ADD . /app

CMD ["npm", "start"]
