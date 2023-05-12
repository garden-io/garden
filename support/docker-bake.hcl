// required
variable "CODENAME" {
}
variable "MINOR_VERSION" {
}
variable "MAJOR_VERSION" {
}

// optional
variable "PATCH_VERSION" {
  default = ""
}
variable "PRERELEASE" {
  default = ""
}

function "isProductionRelease" {
  params = []
  result = PRERELEASE == ""
}

function "isPreRelease" {
  params = []
  result = PRERELEASE != "" && PATCH_VERSION != ""
}

function "isEdgeRelease" {
  params = []
  result = PRERELEASE != "" && PATCH_VERSION == ""
}

function "withLatest" {
  params = [tags]
  result = "${isProductionRelease() ? concat(tags, ["latest"]) : tags}"
}

function "tags" {
  params = [flavor]
  result = [ for tag, condition in
      {
        // edge release
        "${CODENAME}-${PRERELEASE}-${flavor}": isEdgeRelease(),
        "${MAJOR_VERSION}.${MINOR_VERSION}-${PRERELEASE}-${flavor}": isEdgeRelease(),

        // prerelease version
        "${MAJOR_VERSION}.${MINOR_VERSION}.${PATCH_VERSION}-${PRERELEASE}-${flavor}": isPreRelease(),

        // production release
        "${CODENAME}-${flavor}": isProductionRelease(),
        "${MAJOR_VERSION}.${MINOR_VERSION}-${flavor}": isProductionRelease(),
        "${MAJOR_VERSION}.${MINOR_VERSION}.${PATCH_VERSION}-${flavor}": isProductionRelease(),
      }
    : tag if condition
  ]
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
  targets = [
    "garden-alpine-base",
    "garden-aws",
    "garden-azure",
    "garden-gcloud",
    "garden-aws-gcloud",
    "garden-aws-gcloud-azure"
  ]
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
