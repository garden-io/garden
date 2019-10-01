#/bin/bash
NANOS=$(date +%s%N)
sed -re 's/\"[0-9]*\"/\"'"$(($NANOS))"'\"/' -i src/main/java/hello/Greeter.java
gradle jar
rm ../../../container/jar/helloworld.jar
cp build/libs/Hello\ World.jar  ../../../container/jar/helloworld.jar
