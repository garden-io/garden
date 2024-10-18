/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DockerImageWithDigest } from "../../util/string.js"
import { gardenEnv } from "../../constants.js"
import { makeDocsLinkPlain } from "../../docs/common.js"

export const rsyncPortName = "garden-rsync"
export const buildSyncVolumeName = `garden-sync`

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

// Docker images that Garden ships with
export const k8sUtilImageNameLegacy: DockerImageWithDigest =
  "gardendev/k8s-util:0.5.7@sha256:522da245a5e6ae7c711aa94f84fc83f82a8fdffbf6d8bc48f4d80fee0e0e631b"
export const k8sUtilImageName: DockerImageWithDigest =
  "gardendev/k8s-util:0.6.2@sha256:f51e7ce040e2e23bc0eaa7216e4d976f13786d96773ef7b8c8f349e7a63d74e9"

export function getK8sUtilImageName(): DockerImageWithDigest {
  return gardenEnv.GARDEN_ENABLE_NEW_SYNC ? k8sUtilImageName : k8sUtilImageNameLegacy
}

export const k8sSyncUtilImageNameLegacy: DockerImageWithDigest =
  "gardendev/k8s-sync:0.1.5@sha256:28263cee5ac41acebb8c08f852c4496b15e18c0c94797d7a949a4453b5f91578"
export const k8sSyncUtilImageName: DockerImageWithDigest =
  "gardendev/k8s-sync:0.2.2@sha256:9ebcd84df4a3a55ae0ba95051cab521d249a4d2d7a15d04da7301c888c02347b"

export const k8sSyncUtilContainerName = "garden-sync-init"

export function getK8sSyncUtilImageName(): DockerImageWithDigest {
  return gardenEnv.GARDEN_ENABLE_NEW_SYNC ? k8sSyncUtilImageName : k8sSyncUtilImageNameLegacy
}

export const k8sReverseProxyImageName: DockerImageWithDigest =
  "gardendev/k8s-reverse-proxy:0.1.1@sha256:2dff2275fc8c32cc0eba50eebd7ace6fdb007d9b3f4bd48d94355057324b2394"
export const buildkitImageName: DockerImageWithDigest =
  "gardendev/buildkit:v-0.16.0@sha256:ee7aa12e6fdba79ee9838631995fa7c5a12aba9091a0753dedfe891d430c8182"
export const buildkitRootlessImageName: DockerImageWithDigest =
  "gardendev/buildkit:v-0.16.0-rootless@sha256:634506c016691b079e44614c5de65e0b0d4a98070304f6089e15f0279bfca411"
export const defaultKanikoImageName: DockerImageWithDigest =
  "gcr.io/kaniko-project/executor:v1.11.0-debug@sha256:32ba2214921892c2fa7b5f9c4ae6f8f026538ce6b2105a93a36a8b5ee50fe517"
export const defaultGardenIngressControllerDefaultBackendImage: DockerImageWithDigest =
  "gardendev/default-backend:v0.1@sha256:1b02920425eea569c6be53bb2e3d2c1182243212de229be375da7a93594498cf"
export const defaultGardenIngressControllerImage: DockerImageWithDigest =
  "k8s.gcr.io/ingress-nginx/controller:v1.1.3@sha256:31f47c1e202b39fadecf822a9b76370bd4baed199a005b3e7d4d1455f4fd3fe2"
export const defaultGardenIngressControllerKubeWebhookCertGenImage: DockerImageWithDigest =
  "k8s.gcr.io/ingress-nginx/kube-webhook-certgen:v1.1.1@sha256:64d8c73dca984af206adf9d6d7e46aa550362b1d7a01f3a0a91b20cc67868660"

export const buildkitDeploymentName = "garden-buildkit"
export const buildkitContainerName = "buildkitd"
export const defaultSystemNamespace = "garden-system"

export const syncGuideRelPath = "guides/code-synchronization"
export const syncGuideLink = makeDocsLinkPlain(syncGuideRelPath)
