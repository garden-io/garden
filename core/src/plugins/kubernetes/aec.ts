/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { GARDEN_CORE_ROOT } from "../../constants.js"
import { gardenAnnotationKey } from "../../util/annotations.js"
import type { KubernetesPluginContext } from "./config.js"
import type { KubernetesDeployment, KubernetesResource } from "./types.js"
import type { V1Deployment, V1StatefulSet, V1ReplicaSet } from "@kubernetes/client-node"

export const gardenAecAgentServiceAccountName = "aec-agent"

export function getAecAgentManifests({
  imageOverride,
  serviceAccessToken,
  systemNamespace,
  localDevMode,
}: {
  imageOverride: string | undefined
  serviceAccessToken: string
  systemNamespace: string
  localDevMode?: boolean
}): KubernetesResource[] {
  const serviceAccountName = "garden-aec-agent"

  if (localDevMode && process.env.GARDEN_SEA_EXTRACTED_ROOT) {
    throw new Error("Local dev mode is not supported when running a binary build")
  }

  const deployment: KubernetesDeployment = {
    kind: "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: serviceAccountName,
      namespace: systemNamespace,
    },
    spec: {
      replicas: 1,
      strategy: {
        type: "Recreate",
      },
      selector: {
        matchLabels: {
          app: serviceAccountName,
        },
      },
      template: {
        metadata: {
          labels: {
            app: serviceAccountName,
          },
        },
        spec: {
          serviceAccountName,
          automountServiceAccountToken: true, // <-- This enables mounting the Kubernetes API token
          containers: [
            {
              name: serviceAccountName,
              image: getAecAgentImage(imageOverride, localDevMode),
              imagePullPolicy: "Always", // FIXME: Update this once we have a stable and versioned image tag
              command: ["/bin/sh", "-c", "sleep infinity"], // TODO: Update once we have the AEC agent command
              resources: {
                requests: {
                  cpu: "100m",
                  memory: "200Mi",
                },
                limits: {
                  cpu: "1000m",
                  memory: "1000Mi",
                },
              },
              env: [
                {
                  name: "GARDEN_AUTH_TOKEN",
                  value: serviceAccessToken,
                },
              ],
              // If local dev mode is enabled, we bind mount the local repo into the container
              volumeMounts: localDevMode
                ? [
                    {
                      name: "local-repo",
                      mountPath: "/garden",
                      readOnly: true,
                    },
                  ]
                : [],
            },
          ],
          volumes: localDevMode
            ? [
                {
                  name: "local-repo",
                  hostPath: {
                    path: resolve(GARDEN_CORE_ROOT, ".."),
                    type: "Directory",
                  },
                },
              ]
            : [],
        },
      },
    },
  }

  // ServiceAccount
  const serviceAccount: KubernetesResource = {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: {
      name: serviceAccountName,
      namespace: systemNamespace,
    },
    automountServiceAccountToken: true,
  }

  // ClusterRole with permissions for namespaces and workloads
  const clusterRole: KubernetesResource = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: {
      name: "garden-aec-agent",
    },
    rules: [
      // Namespace permissions
      {
        apiGroups: [""],
        resources: ["namespaces"],
        verbs: ["get", "list", "watch", "update", "patch", "delete"],
      },
      // Workloads in all namespaces
      {
        apiGroups: ["apps"],
        resources: ["deployments", "statefulsets", "daemonsets", "replicasets"],
        verbs: ["get", "list", "watch", "update", "patch", "delete"],
      },
      {
        apiGroups: [""],
        resources: ["replicationcontrollers", "pods", "services"],
        verbs: ["get", "list", "watch", "update", "patch", "delete"],
      },
      {
        apiGroups: ["batch"],
        resources: ["jobs", "cronjobs"],
        verbs: ["get", "list", "watch", "update", "patch", "delete"],
      },
    ],
  }

  // ClusterRoleBinding
  const clusterRoleBinding: KubernetesResource = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: {
      name: "garden-aec-agent",
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: serviceAccountName,
        namespace: systemNamespace,
      },
    ],
    roleRef: {
      kind: "ClusterRole",
      name: "garden-aec-agent",
      apiGroup: "rbac.authorization.k8s.io",
    },
  }

  return [serviceAccount, clusterRole, clusterRoleBinding, deployment]
}

export function isAecEnabled(ctx: KubernetesPluginContext) {
  return (
    ctx.environmentConfig.aec && ctx.environmentConfig.aec.triggers.length > 0 && !ctx.environmentConfig.aec.disabled
  )
}

export function getAecAnnotations(ctx: KubernetesPluginContext) {
  const aecConfig = ctx.environmentConfig.aec

  if (!aecConfig) {
    return {}
  }

  return {
    [gardenAnnotationKey("last-deployed")]: new Date().toISOString(),
    [gardenAnnotationKey("aec-config")]: JSON.stringify(aecConfig || {}),
  }
}

function getAecAgentImage(imageOverride: string | undefined, localDevMode?: boolean) {
  // TODO: Once stable, use a stable image tag based on the version of the CLI
  return imageOverride || (localDevMode ? "garden-dev-local" : "gardendev/garden:0.14-edge-bookworm")
}

export type PausableWorkload =
  | KubernetesResource<V1Deployment>
  | KubernetesResource<V1StatefulSet>
  | KubernetesResource<V1ReplicaSet>

export function isPausable(resource: KubernetesResource): resource is PausableWorkload {
  return resource.kind === "Deployment" || resource.kind === "StatefulSet" || resource.kind === "ReplicaSet"
}

/**
 * Update the manifest for the specified resource in order to "pause" it.
 * Replicas are set to zero and annotations added.
 * For resources managed by Helm we add a special annotation that is then
 * checked when trying to redeploy a paused environment.
 * Otherwise, we invalidate the "garden.io/manifest-hash" annotation.
 */
export function getPausedResourceManifest<R extends PausableWorkload>(resource: R): R {
  if (typeof resource.spec?.replicas !== "undefined") {
    resource.spec.replicas = 0

    if (resource.metadata) {
      resource.metadata.annotations = getAnnotationsForPausedWorkload(resource)
    }
  }
  return resource
}

export function getAnnotationsForPausedWorkload(resource: PausableWorkload) {
  const updatedAnnotations = { ...resource.metadata?.annotations }
  // We invalidate the garden manifest hash to trigger a redeploy at the
  // next "garden deploy" run.
  if (resource.metadata?.annotations?.["garden.io/manifest-hash"]) {
    updatedAnnotations["garden.io/manifest-hash"] = "paused"
  }

  // If the resource is managed by Helm we add the "garden.io/aec-status": "paused" annotation
  if (resource.metadata?.labels?.["app.kubernetes.io/managed-by"] === "Helm") {
    updatedAnnotations[gardenAnnotationKey("aec-status")] = "paused"
  }

  return updatedAnnotations
}
