FROM alpine
RUN apk add entr
RUN mkdir app
WORKDIR /app
EXPOSE 8080

COPY bin/ /app/
 
CMD ls binary | entr -r ./binary