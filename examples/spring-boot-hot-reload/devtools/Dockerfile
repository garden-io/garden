FROM maven:3.6.0-jdk-11-slim
WORKDIR /app

COPY pom.xml /app/pom.xml
RUN mvn dependency:resolve

RUN mkdir -p /app/target
COPY src /app/src
# RUN mvn install

ENV JVM_OPTS "-XX:+UseCGroupMemoryLimitForHeap -XX:MaxRAMFraction=1"
RUN mvn install
# RUN mvn compile
CMD ["mvn", "spring-boot:run"]

EXPOSE 8080
