FROM linuxserver/openssh-server:latest

ARG PUBLIC_KEY_FILE
WORKDIR /app
COPY ${PUBLIC_KEY_FILE} /app

ENV SSH_PORT=2222
EXPOSE ${SSH_PORT}

ENV APP_PORT=8080
EXPOSE ${APP_PORT}

RUN sed -i 's/AllowTcpForwarding no/AllowTcpForwarding yes/g' /etc/ssh/sshd_config && \
    sed -i 's/GatewayPorts no/GatewayPorts yes/g' /etc/ssh/sshd_config
