variable "CODENAME" {
}
variable "MINOR_VERSION" {
}
variable "MAJOR_VERSION" {
}
variable "PATCH_VERSION" {
}
variable "PRERELEASE" {
  default = ""
}

function "withLatest" {
  params = [tags]
  result = "${PRERELEASE == "" ? concat(tags, ["latest"]) : tags}"
}

function "tags" {
  params = [flavor]
  result = "${PRERELEASE != "" ?
    [
    // prerelease tags
    "${CODENAME}-${PRERELEASE}-${flavor}",
    "${MAJOR_VERSION}.${MINOR_VERSION}-${PRERELEASE}-${flavor}"
    ]
    : [
    // production release tags
    "${CODENAME}-${flavor}",
    "${MAJOR_VERSION}.${MINOR_VERSION}-${flavor}",
    "${MAJOR_VERSION}.${MINOR_VERSION}.${PATCH_VERSION}-${flavor}"

  ]}"
}

function "repository" {
  params = [repository, tags]
  result = [for t in tags : "${repository}:${t}"]
}

group "all" {
  targets = ["alpine", "buster"]
}

target "buster" {
  dockerfile = "../../support/buster.Dockerfile"
  platforms  = ["linux/amd64"]
  context    = "dist/linux-amd64"
  tags       = repository("gardendev/garden", tags("buster"))
}

group "alpine" {
  targets = ["garden-alpine-base", "garden-aws", "garden-azure", "garden-gcloud", "garden-aws-gcloud", "garden-aws-gcloud-azure"]
}

target "garden-alpine-base" {
  dockerfile = "../../support/alpine.Dockerfile"
  platforms  = ["linux/amd64"]
  context    = "dist/alpine-amd64"
  tags       = repository("gardendev/garden", withLatest(tags("alpine")))
}

target "garden-aws" {
  inherits = ["garden-alpine-base"]
  tags     = repository("gardendev/garden-aws", withLatest(tags("alpine")))
}

target "garden-azure" {
  inherits = ["garden-alpine-base"]
  tags     = repository("gardendev/garden-azure", withLatest(tags("alpine")))
}

target "garden-gcloud" {
  inherits = ["garden-alpine-base"]
  tags     = repository("gardendev/garden-gcloud", withLatest(tags("alpine")))
}

target "garden-aws-gcloud" {
  inherits = ["garden-alpine-base"]
  tags     = repository("gardendev/garden-aws-gcloud", withLatest(tags("alpine")))
}

target "garden-aws-gcloud-azure" {
  inherits = ["garden-alpine-base"]
  tags     = repository("gardendev/garden-aws-gcloud-azure", withLatest(tags("alpine")))
}
