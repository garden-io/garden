FROM node:10-alpine


RUN npm install -g gatsby-cli
WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
ADD . /app

CMD ["npm", "run", "dev"]
