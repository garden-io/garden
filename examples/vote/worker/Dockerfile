FROM maven:3.9-amazoncorretto-11-alpine AS build

WORKDIR /code

COPY pom.xml /code/pom.xml
RUN ["mvn", "dependency:resolve"]
RUN ["mvn", "verify"]

# Adding source, compile and package into a fat jar
COPY ["src/main", "/code/src/main"]
RUN ["mvn", "package"]

FROM amazoncorretto:11-alpine

COPY --from=build /code/target/worker-jar-with-dependencies.jar /

CMD ["java", "-jar", "/worker-jar-with-dependencies.jar"]
