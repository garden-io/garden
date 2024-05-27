FROM linuxserver/openssh-server:version-9.6_p1-r0@sha256:813375fb9b6d247c4ee355d94ac2feda372d0f5553f01f2a12e44b258972fee2

WORKDIR /app

ENV SSH_PORT=2222
EXPOSE ${SSH_PORT}

EXPOSE ${GARDEN_REMOTE_CONTAINER_PORTS}

RUN sed -i 's/AllowTcpForwarding no/AllowTcpForwarding yes/g' /etc/ssh/sshd_config && \
    sed -i 's/GatewayPorts no/GatewayPorts yes/g' /etc/ssh/sshd_config
