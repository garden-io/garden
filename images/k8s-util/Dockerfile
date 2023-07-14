ARG BASE_IMAGE
FROM ${BASE_IMAGE}

RUN apk add --no-cache wget rsync skopeo
RUN cd /usr/local/bin && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  echo "af805202cb5d627dde2e6d4be1f519b195fd5a3a35ddc88d5010b4a4e5a98dd8  docker-credential-ecr-login" | sha256sum -c && \
  chmod +x docker-credential-ecr-login

RUN adduser -g 1000 -D user && \
  mkdir -p /data && \
  chown -R user:user /data

USER user

ADD rsync-server.sh /
