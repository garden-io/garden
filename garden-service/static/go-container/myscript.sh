#/bin/sh
apk add entr
ls binary | entr -r ./binary 
