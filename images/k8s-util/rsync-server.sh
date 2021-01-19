#!/bin/sh
PORT=${RSYNC_PORT:-"873"}
VOLUME=${VOLUME:-/data}
ALLOW=${ALLOW:-192.168.0.0/16 172.16.0.0/12}

mkdir -p ${VOLUME}
mkdir -p ${VOLUME}/tmp

cat <<EOF > /home/user/rsyncd.conf
uid = 1000
#gid = 1000
use chroot = no
log file = /dev/stdout
reverse lookup = no
munge symlinks = yes
[volume]
    hosts deny = *
    hosts allow = ${ALLOW}
    read only = false
    path = ${VOLUME}
    comment = build context volume
EOF

exec /usr/bin/rsync --no-detach --port=${PORT} --daemon --config /home/user/rsyncd.conf
