/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DockerImageWithDigest } from "../../util/string.js"
import { makeDocsLinkPlain } from "../../docs/common.js"

export const MAX_CONFIGMAP_DATA_SIZE = 1024 * 1024 // max ConfigMap data size is 1MB
// max ConfigMap data size is 1MB but we need to factor in overhead, plus in some cases the log is duplicated in
// the outputs field, so we cap at 250kB.
export const MAX_RUN_RESULT_LOG_LENGTH = 250 * 1024

export const PROXY_CONTAINER_USER_NAME = "garden-proxy-user"
export const PROXY_CONTAINER_SSH_TUNNEL_PORT = 2222
export const PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME = "garden-prx-ssh"

export const systemDockerAuthSecretName = "builder-docker-config"
export const dockerAuthSecretKey = ".dockerconfigjson"
export const skopeoDaemonContainerName = "util"
export const defaultIngressClass = "nginx"
export const rsyncPortName = "garden-rsync"
export const buildSyncVolumeName = `garden-sync`
export const k8sSyncUtilContainerName = "garden-sync-init"
export const buildkitDeploymentName = "garden-buildkit"
export const buildkitContainerName = "buildkitd"
export const defaultSystemNamespace = "garden-system"

export const syncGuideRelPath = "guides/code-synchronization"
export const syncGuideLink = makeDocsLinkPlain(syncGuideRelPath)

export const defaultUtilImageRegistryDomain = "docker.io"

function makeImagePath({
  imageName,
  registryDomain,
}: {
  imageName: DockerImageWithDigest
  registryDomain: string
}): DockerImageWithDigest {
  const domainWithoutTrailingSlash = registryDomain.replace(/\/$/, "")

  return `${domainWithoutTrailingSlash}/${imageName}`
}

export function getK8sUtilImagePath(registryDomain: string): DockerImageWithDigest {
  const k8sUtilImageName: DockerImageWithDigest =
    "gardendev/k8s-util:0.6.3@sha256:82d3a625c23d5bcd3007d15ffb45755ed8d83e9adfb0c2982d9a02e8288d2f13"

  return makeImagePath({ imageName: k8sUtilImageName, registryDomain })
}

export function getK8sSyncUtilImagePath(registryDomain: string): DockerImageWithDigest {
  const k8sSyncUtilImageName: DockerImageWithDigest =
    "gardendev/k8s-sync:0.2.3@sha256:840dcb91a62e66b7e0dcdcfe5537a906c219d6bad6b0cc631407b4befab03af1"

  return makeImagePath({ imageName: k8sSyncUtilImageName, registryDomain })
}

export function getK8sReverseProxyImagePath(registryDomain: string): DockerImageWithDigest {
  const k8sReverseProxyImageName: DockerImageWithDigest =
    "gardendev/k8s-reverse-proxy:0.1.1@sha256:2dff2275fc8c32cc0eba50eebd7ace6fdb007d9b3f4bd48d94355057324b2394"

  return makeImagePath({ imageName: k8sReverseProxyImageName, registryDomain })
}
export function getBuildkitImagePath(registryDomain: string): DockerImageWithDigest {
  const buildkitImageName: DockerImageWithDigest =
    "gardendev/buildkit:v-0.16.0@sha256:ee7aa12e6fdba79ee9838631995fa7c5a12aba9091a0753dedfe891d430c8182"

  return makeImagePath({ imageName: buildkitImageName, registryDomain })
}

export function getBuildkitRootlessImagePath(registryDomain: string): DockerImageWithDigest {
  const buildkitRootlessImageName: DockerImageWithDigest =
    "gardendev/buildkit:v-0.16.0-rootless@sha256:634506c016691b079e44614c5de65e0b0d4a98070304f6089e15f0279bfca411"

  return makeImagePath({ imageName: buildkitRootlessImageName, registryDomain })
}
export function getDefaultGardenIngressControllerDefaultBackendImagePath(
  registryDomain: string
): DockerImageWithDigest {
  const defaultGardenIngressControllerDefaultBackendImage: DockerImageWithDigest =
    "gardendev/default-backend:v0.1@sha256:1b02920425eea569c6be53bb2e3d2c1182243212de229be375da7a93594498cf"

  return makeImagePath({ imageName: defaultGardenIngressControllerDefaultBackendImage, registryDomain })
}

export const defaultKanikoImageName: DockerImageWithDigest =
  "gcr.io/kaniko-project/executor:v1.11.0-debug@sha256:32ba2214921892c2fa7b5f9c4ae6f8f026538ce6b2105a93a36a8b5ee50fe517"
export const defaultGardenIngressControllerImage: DockerImageWithDigest =
  "registry.k8s.io/ingress-nginx/controller:v1.12.0@sha256:e6b8de175acda6ca913891f0f727bca4527e797d52688cbe9fec9040d6f6b6fa"
export const defaultGardenIngressControllerKubeWebhookCertGenImage: DockerImageWithDigest =
  "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.5.1@sha256:0de05718b59dc33b57ddfb4d8ad5f637cefd13eafdec0e1579d782b3483c27c3"
