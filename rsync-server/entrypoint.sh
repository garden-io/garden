#!/bin/sh
VOLUME=${VOLUME:-/data}
ALLOW=${ALLOW:-192.168.0.0/16 172.16.0.0/12}

mkdir -p ${VOLUME}

cat <<EOF > /etc/rsyncd.conf
uid = 0
#gid =
use chroot = no
log file = /dev/stdout
reverse lookup = no
munge symlinks = yes
[volume]
    hosts deny = *
    hosts allow = ${ALLOW}
    read only = false
    path = ${VOLUME}
    comment = docker volume
EOF

exec /usr/bin/rsync --no-detach --daemon --config /etc/rsyncd.conf
