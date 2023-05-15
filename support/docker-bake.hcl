##
## Parameters
##

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

##
## Helpers
##

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

##
## Groups
##

group "all" {
  targets = ["alpine", "buster"]
}

group "alpine" {
  targets = [
    "alpine-base",
    "alpine-aws",
    "alpine-azure",
    "alpine-gcloud",
    "alpine-aws-gcloud",
    "alpine-aws-gcloud-azure"
  ]
}

##
## Images
##

target "buster" {
  dockerfile = "../../support/buster.Dockerfile"
  target     = "buster-base"
  platforms  = ["linux/amd64"]
  context    = "dist/linux-amd64"
  tags       = repository("gardendev/garden", tags("buster"))
}

target "alpine-base" {
  dockerfile = "../../support/alpine.Dockerfile"
  target     = "garden-alpine-base"
  platforms  = ["linux/amd64"]
  context    = "dist/alpine-amd64"
  tags       = repository("gardendev/garden", withLatest(tags("alpine")))
}

target "alpine-aws" {
  inherits   = ["alpine-base"]
  target     = "garden-aws"
  tags       = repository("gardendev/garden-aws", withLatest(tags("alpine")))
}

target "alpine-azure" {
  inherits   = ["alpine-base"]
  target     = "garden-azure"
  tags       = repository("gardendev/garden-azure", withLatest(tags("alpine")))
}

target "alpine-gcloud" {
  inherits   = ["alpine-base"]
  target     = "garden-gcloud"
  tags       = repository("gardendev/garden-gcloud", withLatest(tags("alpine")))
}

target "alpine-aws-gcloud" {
  inherits   = ["alpine-base"]
  target     = "garden-aws-gcloud"
  tags       = repository("gardendev/garden-aws-gcloud", withLatest(tags("alpine")))
}

target "alpine-aws-gcloud-azure" {
  inherits   = ["alpine-base"]
  target     = "garden-aws-gcloud-azure"
  tags       = repository("gardendev/garden-aws-gcloud-azure", withLatest(tags("alpine")))
}
