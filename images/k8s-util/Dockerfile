ARG BASE_IMAGE
FROM ${BASE_IMAGE}

RUN apk add --no-cache rsync skopeo
RUN cd /usr/local/bin && \
  curl -O https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  chmod +x docker-credential-ecr-login

RUN adduser -g 1000 -D user && \
  mkdir -p /data && \
  chown -R user:user /data

USER user

ADD rsync-server.sh /
