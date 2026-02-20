FROM golang:1.18.3-alpine3.16

ENV PORT=8080
EXPOSE ${PORT}
WORKDIR /app

COPY main.go .

RUN go mod init main && go build -o main .

ENTRYPOINT ["./main"]
