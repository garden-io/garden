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
  params = [condition, tags]
  result = "${isProductionRelease() && condition ? concat(tags, ["latest"]) : tags}"
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
  targets = ["bookworm", "alpine"]
}

group "bookworm" {
  targets = [
    # Root bookworm
    "bookworm-base",
    "bookworm-aws",
    "bookworm-azure",
    "bookworm-gcloud",
    "bookworm-aws-gcloud",
    "bookworm-aws-gcloud-azure",
    # Rootless bookworm
    "bookworm-rootless",
    "bookworm-aws-rootless",
    "bookworm-azure-rootless",
    "bookworm-gcloud-rootless",
    "bookworm-aws-gcloud-rootless",
    "bookworm-aws-gcloud-azure-rootless",
  ]
}

group "alpine" {
  targets = [
    # Root
    "alpine-base",
    "alpine-aws",
    "alpine-azure",
    "alpine-gcloud",
    "alpine-aws-gcloud",
    "alpine-aws-gcloud-azure",
    # Rootless
    "alpine-rootless",
    "alpine-aws-rootless",
    "alpine-azure-rootless",
    "alpine-gcloud-rootless",
    "alpine-aws-gcloud-rootless",
    "alpine-aws-gcloud-azure-rootless",
  ]
}

##
## Images
##

target "bookworm-base" {
  dockerfile = "../../support/debian.Dockerfile"
  target     = "garden-base"
  platforms  = ["linux/amd64"]
  context    = "dist/linux-amd64"
  tags       = repository("gardendev/garden", tags("bookworm"))
}

target "alpine-base" {
  dockerfile = "../../support/alpine.Dockerfile"
  target     = "garden-base"
  platforms  = ["linux/amd64"]
  context    = "dist/alpine-amd64"
  tags       = repository("gardendev/garden", withLatest(true, tags("alpine")))
}

target "aws" {
  name = "${distro}-aws"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  target     = "garden-aws"
  tags       = repository("gardendev/garden-aws", withLatest(distro=="alpine", tags(distro)))
}

target "azure" {
  name = "${distro}-azure"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  target     = "garden-azure"
  tags       = repository("gardendev/garden-azure", withLatest(distro=="alpine", tags(distro)))
}

target "gcloud" {
  name = "${distro}-gcloud"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  target     = "garden-gcloud"
  tags       = repository("gardendev/garden-gcloud", withLatest(distro=="alpine", tags(distro)))
}

target "aws-gcloud" {
  name = "${distro}-aws-gcloud"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  target     = "garden-aws-gcloud"
  tags       = repository("gardendev/garden-aws-gcloud", withLatest(distro=="alpine", tags(distro)))
}

target "aws-gcloud-azure" {
  name = "${distro}-aws-gcloud-azure"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  target     = "garden-aws-gcloud-azure"
  tags       = repository("gardendev/garden-aws-gcloud-azure", withLatest(distro=="alpine", tags(distro)))
}

##
## Images (Rootless)
##

target "rootless" {
  name = "${distro}-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-base"]
  tags     = repository("gardendev/garden", tags("${distro}-rootless"))
  args = {
    VARIANT: "rootless"
  }
}

target "aws-rootless" {
  name       = "${distro}-aws-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-rootless", "${distro}-aws"]
  tags       = repository("gardendev/garden-aws", tags("${distro}-rootless"))
}

target "azure-rootless" {
  name       = "${distro}-azure-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-rootless", "${distro}-azure"]
  tags       = repository("gardendev/garden-azure", tags("${distro}-rootless"))
}

target "gcloud-rootless" {
  name       = "${distro}-gcloud-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-rootless", "${distro}-gcloud"]
  tags       = repository("gardendev/garden-gcloud", tags("${distro}-rootless"))
}

target "aws-gcloud-rootless" {
  name       = "${distro}-aws-gcloud-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-rootless", "${distro}-aws-gcloud"]
  tags       = repository("gardendev/garden-aws-gcloud", tags("${distro}-rootless"))
}

target "aws-gcloud-azure-rootless" {
  name       = "${distro}-aws-gcloud-azure-rootless"
  matrix = {
    distro = ["bookworm", "alpine"]
  }
  inherits   = ["${distro}-rootless", "${distro}-aws-gcloud-azure"]
  tags       = repository("gardendev/garden-aws-gcloud-azure", tags("${distro}-rootless"))
}
