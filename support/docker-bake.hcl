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
variable "BRANCH_NAME" {
  default = ""
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

function "cacheFrom" {
  params = [repository, flavor]
  result = ["type=registry,ref=${repository}:_buildcache_${flavor}"]
}

function "cacheTo" {
  params = [repository, flavor]
  result = "${BRANCH_NAME == "0.13" || BRANCH_NAME == "main" ? "${cacheFrom(repository, flavor)},mode=max" : ""}"
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
  cache-from = cacheFrom("gardendev/garden", "buster")
  cache-to   = cacheTo("gardendev/garden", "buster")
}

target "alpine-base" {
  dockerfile = "../../support/alpine.Dockerfile"
  target     = "garden-alpine-base"
  platforms  = ["linux/amd64"]
  context    = "dist/alpine-amd64"
  tags       = repository("gardendev/garden", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden", "alpine")
  cache-to   = cacheTo("gardendev/garden", "alpine")
}

target "alpine-aws" {
  inherits   = ["alpine-base"]
  target     = "garden-aws"
  tags       = repository("gardendev/garden-aws", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden-aws", "alpine")
  cache-to   = cacheTo("gardendev/garden-aws", "alpine")
}

target "alpine-azure" {
  inherits   = ["alpine-base"]
  target     = "garden-azure"
  tags       = repository("gardendev/garden-azure", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden-azure", "alpine")
  cache-to   = cacheTo("gardendev/garden-azure", "alpine")
}

target "alpine-gcloud" {
  inherits   = ["alpine-base"]
  target     = "garden-gcloud"
  tags       = repository("gardendev/garden-gcloud", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden-gcloud", "alpine")
  cache-to   = cacheTo("gardendev/garden-gcloud", "alpine")
}

target "alpine-aws-gcloud" {
  inherits   = ["alpine-base"]
  target     = "garden-aws-gcloud"
  tags       = repository("gardendev/garden-aws-gcloud", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden-aws-gcloud", "alpine")
  cache-to   = cacheTo("gardendev/garden-aws-gcloud", "alpine")
}

target "alpine-aws-gcloud-azure" {
  inherits   = ["alpine-base"]
  target     = "garden-aws-gcloud-azure"
  tags       = repository("gardendev/garden-aws-gcloud-azure", withLatest(tags("alpine")))
  cache-from = cacheFrom("gardendev/garden-aws-gcloud-azure", "alpine")
  cache-to   = cacheTo("gardendev/garden-aws-gcloud-azure", "alpine")
}
