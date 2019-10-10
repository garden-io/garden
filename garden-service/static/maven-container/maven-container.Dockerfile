ARG IMAGE_VERSION=8-jre
FROM openjdk:${IMAGE_VERSION}

EXPOSE 8080

ENV JVM_OPTS "-XX:+UnlockExperimentalVMOptions -XX:+UseCGroupMemoryLimitForHeap -XX:MaxRAMFraction=1"

ENTRYPOINT ["java", "-server", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/usr/local/bin/app.jar"]

COPY app.jar /usr/local/bin/app.jar
