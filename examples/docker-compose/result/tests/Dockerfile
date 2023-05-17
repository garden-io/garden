# FROM busybox:1.36

# # TODO: Finish this Dockerfile, make an actual test suite that actually works. - Thor

# # FROM node:8.9-slim
# # RUN apt-get update -qq && apt-get install -qy \ 
# #     ca-certificates \
# #     bzip2 \
# #     curl \
# #     libfontconfig \
# #     --no-install-recommends
# # RUN yarn global add phantomjs-prebuilt
# ADD . /app
# WORKDIR /app
# CMD ["/app/tests.sh"]
FROM node:12.22.6-alpine

WORKDIR /app

ADD package.json package-lock.json /app/

RUN npm install
ADD . /app

CMD ["npm", "run", "test"]
