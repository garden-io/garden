ARG JDK_VERSION=8
FROM openjdk:${JDK_VERSION}-jdk-alpine

RUN addgroup -g 2000 app && \
  adduser -D -u 2000 -G app -h /var/lib/app -s /bin/sh app
USER 2000:2000

EXPOSE 8080

ENV JVM_OPTS "-XX:+UnlockExperimentalVMOptions -XX:+UseCGroupMemoryLimitForHeap -XX:MaxRAMFraction=1"

ENTRYPOINT ["java", "-server", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/usr/local/bin/app.jar"]

COPY app.jar /usr/local/bin/app.jar
