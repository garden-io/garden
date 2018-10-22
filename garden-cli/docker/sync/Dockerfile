FROM alpine:3.8

# system dependencies
RUN apk add --no-cache unison

RUN mkdir host-mount

CMD cp -r host-mount/. project/ \
  && unison -silent -repeat watch -force host-mount host-mount project
