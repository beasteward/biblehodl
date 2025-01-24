FROM openjdk:8-alpine

COPY target/uberjar/biblehodl.jar /biblehodl/app.jar

EXPOSE 3000

CMD ["java", "-jar", "/biblehodl/app.jar"]
