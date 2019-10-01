FROM anapsix/alpine-java
RUN apk add entr
RUN mkdir app
WORKDIR /app

COPY jar/ /app/
 
CMD ls /app/helloworld.jar | entr bash script.sh