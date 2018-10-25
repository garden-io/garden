FROM alpine:3.8

# system dependencies
RUN apk add --no-cache unison

CMD unison -repeat watch -force host-mount host-mount project
