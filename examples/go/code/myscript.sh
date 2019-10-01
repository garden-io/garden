#/bin/bash
sed -re 's/0, ([0-9]*)\)/0, '"$(($(date +%s%N)))"'\)/' -i main.go
CGO_ENABLED=0 GOOS=linux GOCACHE=$PWD/cache go build -o binary -ldflags '-w'
# upx binary -1
cp binary  ../../../container/bin/binary



