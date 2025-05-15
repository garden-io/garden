
// Updated build definition using the latest SBT syntax
lazy val root = (project in file("."))
  .settings(
    organization := "com.example",
    scalaVersion := "3.7.0", // Latest Scala 3 version (released May 7, 2025)
    version := "0.1.0-SNAPSHOT",
    name := "Hello",
    libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.19" % "test"
  )


/// ----- this is only needed as work-around for missing jib-container support afaik -----

lazy val app = (project in file("app"))
  .settings(
    assembly / mainClass := Some("com.example.Hello"),
    // more settings here ...
  )
