---
order: 60
title: Garden Containers on Docker Hub
---

# Garden containers on Docker Hub

We publish a number of containers to our official Docker Hub
account ([hub.docker.com/u/gardendev](https://hub.docker.com/u/gardendev)).

## Garden Containers and bundled tools

For your convenience, we build and publish Docker containers that contain the Garden CLI as well as a number of Cloud
Provider tools with every Garden release (and prerelease).

| Container                                                                                         | Contents                                                                         |
|---------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| [`gardendev/garden`](https://hub.docker.com/r/gardendev/garden)                                   | Contains only Garden CLI                                                         |
| [`gardendev/garden-aws`](https://hub.docker.com/r/gardendev/garden-aws)                           | Contains the Garden CLI, and the AWS CLI v2                                      |
| [`gardendev/garden-azure`](https://hub.docker.com/r/gardendev/garden-azure)                       | Contains the Garden CLI, and the Azure CLI                                       |
| [`gardendev/garden-gcloud`](https://hub.docker.com/r/gardendev/garden-gcloud)                     | Contains the Garden CLI, and the Google Cloud CLI                                |
| [`gardendev/garden-aws-gcloud`](https://hub.docker.com/r/gardendev/garden-aws-gcloud)             | Contains the Garden CLI, the Google Cloud CLI and the AWS CLI v2                 |
| [`gardendev/garden-aws-gcloud-azure`](https://hub.docker.com/r/gardendev/garden-aws-gcloud-azure) | Contains the Garden CLI, the Google Cloud CLI, the AWS CLI v2, and the Azure CLI |

### Tags

| Tag name                       | Meaning                                                                                                                                     |
|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `latest`                       | Latest stable release of Garden CLI 0.13 (Codename Bonsai), the container is based on Alpine Linux.                                         |
| `bonsai-*` or `0.13-*`         | Garden CLI version is 0.13 (Codename Bonsai). If the tag name does not contain edge, this is the latest stable release.                     |
| `acorn-*` or `0.12-*`          | Garden CLI version is 0.12 (Codename Acorn). If the tag name does not contain `edge`, this is the latest stable release.                    |
| `x.y.z-n-*`, e.g. `0.13.0-0`   | Garden CLI prerelease (Full semver version with prerelease modifier)                                                                        |
| `x.y.z-*`, e.g. `0.13.0`       | Garden CLI stable release (Semver version without prerelease)                                                                               |
| `*-edge-*`                     | Edge tags contain the latest, potentially still unreleased changes to the Garden CLI in our development branches.                           |
| `*-alpine` or `*-alpine-*`     | The container is based on Alpine Linux.                                                                                                     |
| `*-buster` or `*-buster-*`     | [DEPRECATED] The container is based on Debian Linux (Buster version). Since Garden `0.13.32`, Buster is no longer supported and maintained. |
| `*-bookwarm` or `*-bookwarm-*` | The container is based on Debian Linux (Bookwarm version). Debian Bookworm has been supported since Garden `0.13.32`.                       |
| `*-rootless`                   | The default user of the container is `gardenuser`. The default user for all other containers is `root`.                                     |

Examples:

- `0.12-edge-alpine`: Latest development build of Garden Acorn (0.12), based on Alpine Linux.
- `bonsai-alpine`: Latest stable release of Bonsai (0.13), based on Alpine Linux.
- `0.13.0-alpine-rootless`: Stable release `0.13.0`, based on Alpine Linux, default user of the container
  is `gardenuser`.
- `0.13.0-0-alpine`: Pre-release `0.13.0-0`, based on Alpine Linux.
