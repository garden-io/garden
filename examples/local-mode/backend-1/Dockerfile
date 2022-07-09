FROM golang:1.17.7-alpine

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

COPY main.go .

RUN go mod init main && go build -o main .

ENTRYPOINT ["./main"]
