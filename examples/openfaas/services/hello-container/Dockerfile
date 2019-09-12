FROM node:9-alpine

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

ADD package.json /app
# We need to specifically add libraries before the npm install step
# because the project depends on a local npm package in the libraries dir
ADD ./libraries /app/libraries
RUN npm install

ADD . /app

CMD ["npm", "start"]
