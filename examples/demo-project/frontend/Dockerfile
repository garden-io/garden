FROM node:12.22.6-buster-slim

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

CMD ["npm", "start"]
