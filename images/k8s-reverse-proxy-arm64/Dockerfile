FROM linuxserver/openssh-server:amd64-8.8_p1-r1-ls77

WORKDIR /app

ENV SSH_PORT=2222
EXPOSE ${SSH_PORT}

EXPOSE ${APP_PORT}

RUN sed -i 's/AllowTcpForwarding no/AllowTcpForwarding yes/g' /etc/ssh/sshd_config && \
    sed -i 's/GatewayPorts no/GatewayPorts yes/g' /etc/ssh/sshd_config
