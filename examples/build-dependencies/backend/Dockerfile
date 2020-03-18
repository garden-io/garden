FROM golang:1.8.3-alpine

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

COPY main.go .

RUN go build -o main .

ENTRYPOINT ["./main"]
