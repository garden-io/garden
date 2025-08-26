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
import { aecAgentHealthCheckPort } from "./commands/aec-agent.js"
import { dedent } from "../../util/string.js"
import type { AecStatus } from "../../config/aec.js"

export const gardenAecAgentServiceAccountName = "aec_agent"

export function getAecAgentManifests({
  imageOverride,
  serviceAccessToken,
  systemNamespace,
  localDevMode,
  description,
  cloudDomain,
  organizationId,
}: {
  imageOverride: string | undefined
  serviceAccessToken: string
  systemNamespace: string
  localDevMode: boolean
  description: string
  cloudDomain: string
  organizationId: string
}): KubernetesResource[] {
  const serviceAccountName = "garden-aec-agent"

  if (localDevMode && process.env.GARDEN_SEA_EXTRACTED_ROOT) {
    throw new Error("Local dev mode is not supported when running a binary build")
  }

  const escapedDescription = description.replace(/"/g, '\\"')

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
              imagePullPolicy: localDevMode ? "IfNotPresent" : "Always", // FIXME: Update this once we have a stable and versioned image tag
              // command: ["garden", "plugins", "kubernetes", "aec-agent", "--", "--description", description],
              command: [
                "/bin/bash",
                "-c",
                dedent`
                  export SERVICE_ACCOUNT_PATH="/var/run/secrets/kubernetes.io/serviceaccount"
                  export TOKEN=$(cat $SERVICE_ACCOUNT_PATH/token)
                  export CA_CERT="$SERVICE_ACCOUNT_PATH/ca.crt"
                  export NAMESPACE=$(cat $SERVICE_ACCOUNT_PATH/namespace)
                  export KUBE_API_SERVER="https://kubernetes.default.svc"
                  export PROJECT_ROOT="/tmp/agent-project"
                  export KUBECONFIG="$PROJECT_ROOT/kubeconfig.yaml"
                  export PROJECT_CONFIG="$PROJECT_ROOT/project.garden.yaml"

                  echo "---"
                  echo "SERVICE_ACCOUNT_PATH: $SERVICE_ACCOUNT_PATH"
                  echo "CA_CERT: $CA_CERT"
                  echo "NAMESPACE: $NAMESPACE"
                  echo "KUBE_API_SERVER: $KUBE_API_SERVER"
                  echo "GARDEN_CLOUD_DOMAIN: $GARDEN_CLOUD_DOMAIN"
                  echo "AGENT_DESCRIPTION: $AGENT_DESCRIPTION"
                  echo "PROJECT_ROOT: $PROJECT_ROOT"
                  echo "KUBECONFIG: $KUBECONFIG"
                  echo "PROJECT_CONFIG: $PROJECT_CONFIG"
                  echo "---\n\n"

                  mkdir -p $PROJECT_ROOT

                  cat <<EOF > $KUBECONFIG
                  apiVersion: v1
                  kind: Config
                  clusters:
                  - name: in-cluster
                    cluster:
                      server: $KUBE_API_SERVER
                      certificate-authority: $CA_CERT
                  users:
                  - name: in-cluster-user
                    user:
                      token: $TOKEN
                  contexts:
                  - name: in-cluster-context
                    context:
                      cluster: in-cluster
                      user: in-cluster-user
                      namespace: $NAMESPACE
                  current-context: in-cluster-context
                  EOF

                  cat <<EOF > $PROJECT_CONFIG
                  apiVersion: garden.io/v2
                  kind: Project
                  name: aec-agent
                  domain: $GARDEN_CLOUD_DOMAIN
                  organizationId: $GARDEN_CLOUD_ORGANIZATION_ID

                  environments:
                    - name: default

                  providers:
                    - name: kubernetes
                      namespace: $NAMESPACE
                      context: in-cluster-context
                      kubeconfig: $KUBECONFIG
                      # NOT USED, but needed for the AEC agent to start up
                      deploymentRegistry:
                        hostname: localhost
                        namespace: aec-agent
                        insecure: true
                  EOF

                  echo "--- project.garden.yaml ---"
                  cat $PROJECT_CONFIG
                  echo "---\n"

                  # TODO: Remove this to avoid echoing the token to the logs
                  echo "--- kubeconfig ---"
                  cat $KUBECONFIG
                  echo "---\n"

                  cd $PROJECT_ROOT
                  git init

                  garden plugins kubernetes aec-agent -- ${localDevMode ? "--interval 10 --ttl 300" : ""} --description "$AGENT_DESCRIPTION" 2>&1 | tee /tmp/aec-agent.log
                `,
              ],
              workingDir: "/garden/static/kubernetes/aec-agent",
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
                {
                  name: "GARDEN_LOGGER_TYPE",
                  value: "basic",
                },
                {
                  name: "GARDEN_LOG_LEVEL",
                  value: localDevMode ? "debug" : "info",
                },
                {
                  name: "GARDEN_CLOUD_DOMAIN",
                  value: cloudDomain,
                },
                {
                  name: "GARDEN_CLOUD_ORGANIZATION_ID",
                  value: organizationId,
                },
                {
                  name: "AGENT_DESCRIPTION",
                  value: escapedDescription,
                },
                {
                  name: "NODE_TLS_REJECT_UNAUTHORIZED",
                  value: localDevMode ? "0" : "1",
                },
              ],
              ports: [
                {
                  name: "health",
                  containerPort: aecAgentHealthCheckPort,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: "/healthz",
                  port: aecAgentHealthCheckPort,
                },
                initialDelaySeconds: 4,
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
              },
              livenessProbe: {
                httpGet: {
                  path: "/healthz",
                  port: aecAgentHealthCheckPort,
                },
                initialDelaySeconds: 10,
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
              },
              // If local dev mode is enabled, we bind mount the local repo into the container
              volumeMounts: localDevMode
                ? [
                    {
                      name: "local-repo",
                      mountPath: "/garden",
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

export function getAecAnnotations({
  ctx,
  status,
  lastDeployed,
}: {
  ctx: KubernetesPluginContext
  status?: AecStatus
  lastDeployed?: Date
}) {
  const aecConfig = ctx.environmentConfig.aec

  if (!aecConfig) {
    return {}
  }

  const annotations = {
    // This may seem incorrect, but we want to transition from env/namespace terminology to env type/name.
    [gardenAnnotationKey("environment-type")]: ctx.environmentName,
    [gardenAnnotationKey("environment-name")]: ctx.namespace,
    [gardenAnnotationKey("aec-config")]: JSON.stringify(aecConfig || {}),
  }

  if (status) {
    annotations[gardenAnnotationKey("aec-status")] = status
  }

  if (lastDeployed) {
    annotations[gardenAnnotationKey("last-deployed")] = lastDeployed.toISOString()
  }

  return annotations
}

function getAecAgentImage(imageOverride: string | undefined, localDevMode?: boolean) {
  // TODO: Once stable, use a stable image tag based on the version of the CLI
  return imageOverride || (localDevMode ? "garden-dev-local:dev" : "gardendev/garden:0.14-edge-bookworm")
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
