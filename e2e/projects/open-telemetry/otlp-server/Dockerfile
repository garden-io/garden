FROM node:18.16.0-alpine

ENV PORT=8080
ENV HEALTHCHECK_PORT=8081
EXPOSE ${PORT}
WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

CMD ["npm", "start"]
