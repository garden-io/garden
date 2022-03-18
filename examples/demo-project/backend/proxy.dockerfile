FROM linuxserver/openssh-server:latest

ARG PUBLIC_KEY_FILE
WORKDIR /app
COPY ${PUBLIC_KEY_FILE} /app

ENV SSH_PORT=2222
EXPOSE ${SSH_PORT}

ENV APP_PORT=8080
EXPOSE ${APP_PORT}

COPY sshd_config /etc/ssh/sshd_config
