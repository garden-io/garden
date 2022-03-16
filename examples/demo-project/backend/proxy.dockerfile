FROM linuxserver/openssh-server:latest

WORKDIR /app
COPY proxy-key.pub /app

ENV SSH_PORT=2222
EXPOSE ${SSH_PORT}

ENV APP_PORT=8080
EXPOSE ${APP_PORT}

COPY sshd_config /etc/ssh/sshd_config
