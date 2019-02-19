FROM node:9-alpine

ENV PORT=8080
ENV ENVIRONMENT=prod
ENV HELLO_PATH=/hello-prod
EXPOSE ${PORT}
WORKDIR /app

ADD package.json /app
RUN npm install

ADD . /app

CMD ["npm", "start"]
