FROM node:12.22.6-alpine

WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

CMD ["npm", "start"]
