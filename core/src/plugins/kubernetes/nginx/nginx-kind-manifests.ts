/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesResource } from "../types.js"
import { defaultGardenIngressControllerImage } from "../constants.js"

const INGRESS_NGINX_CONTROLLER_VERSION = "1.12.1"

export function kindNginxGetManifests(namespace: string): KubernetesResource[] {
  return [
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx-controller",
        namespace,
      },
      spec: {
        ports: [
          {
            appProtocol: "http",
            name: "http",
            port: 80,
            protocol: "TCP",
            targetPort: "http",
          },
          {
            appProtocol: "https",
            name: "https",
            port: 443,
            protocol: "TCP",
            targetPort: "https",
          },
        ],
        selector: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
        },
        type: "NodePort",
      },
    },
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        labels: {
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
        },
        name: namespace,
      },
    },
    {
      apiVersion: "v1",
      data: {
        "allow-snippet-annotations": "true",
      },
      kind: "ConfigMap",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx-controller",
        namespace,
      },
    },
    {
      apiVersion: "v1",
      automountServiceAccountToken: true,
      kind: "ServiceAccount",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx",
        namespace,
      },
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: {
        labels: {
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx",
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["configmaps", "endpoints", "nodes", "pods", "secrets", "namespaces"],
          verbs: ["list", "watch"],
        },
        {
          apiGroups: [""],
          resources: ["nodes"],
          verbs: ["get"],
        },
        {
          apiGroups: [""],
          resources: ["services"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingresses"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: [""],
          resources: ["events"],
          verbs: ["create", "patch"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingresses/status"],
          verbs: ["update"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingressclasses"],
          verbs: ["get", "list", "watch"],
        },
      ],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "Role",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx",
        namespace,
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["namespaces"],
          verbs: ["get"],
        },
        {
          apiGroups: [""],
          resources: ["configmaps", "pods", "secrets", "endpoints"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: [""],
          resources: ["services"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingresses"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingresses/status"],
          verbs: ["update"],
        },
        {
          apiGroups: ["networking.k8s.io"],
          resources: ["ingressclasses"],
          verbs: ["get", "list", "watch"],
        },
        {
          apiGroups: [""],
          resourceNames: ["ingress-controller-leader"],
          resources: ["configmaps"],
          verbs: ["get", "update"],
        },
        {
          apiGroups: [""],
          resources: ["configmaps"],
          verbs: ["create"],
        },
        {
          apiGroups: [""],
          resources: ["events"],
          verbs: ["create", "patch"],
        },
      ],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "RoleBinding",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx",
        namespace,
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Role",
        name: "ingress-nginx",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: "ingress-nginx",
          namespace,
        },
      ],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        labels: {
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx",
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: "ingress-nginx",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: "ingress-nginx",
          namespace,
        },
      ],
    },
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        name: "ingress-nginx-controller",
        namespace,
      },
      spec: {
        minReadySeconds: 0,
        revisionHistoryLimit: 10,
        selector: {
          matchLabels: {
            "app.kubernetes.io/component": "controller",
            "app.kubernetes.io/instance": "ingress-nginx",
            "app.kubernetes.io/name": "ingress-nginx",
          },
        },
        strategy: {
          rollingUpdate: {
            maxUnavailable: 1,
          },
          type: "RollingUpdate",
        },
        template: {
          metadata: {
            labels: {
              "app.kubernetes.io/component": "controller",
              "app.kubernetes.io/instance": "ingress-nginx",
              "app.kubernetes.io/name": "ingress-nginx",
            },
          },
          spec: {
            containers: [
              {
                args: [
                  "/nginx-ingress-controller",
                  "--election-id=ingress-controller-leader",
                  "--controller-class=k8s.io/ingress-nginx",
                  "--ingress-class=nginx",
                  "--configmap=$(POD_NAMESPACE)/ingress-nginx-controller",
                  "--watch-ingress-without-class=true",
                  "--publish-status-address=localhost",
                ],
                env: [
                  {
                    name: "POD_NAME",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.name",
                      },
                    },
                  },
                  {
                    name: "POD_NAMESPACE",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.namespace",
                      },
                    },
                  },
                  {
                    name: "LD_PRELOAD",
                    value: "/usr/local/lib/libmimalloc.so",
                  },
                ],
                image: defaultGardenIngressControllerImage,
                imagePullPolicy: "IfNotPresent",
                lifecycle: {
                  preStop: {
                    exec: {
                      command: ["/wait-shutdown"],
                    },
                  },
                },
                livenessProbe: {
                  failureThreshold: 5,
                  httpGet: {
                    path: "/healthz",
                    port: 10254,
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  successThreshold: 1,
                  timeoutSeconds: 1,
                },
                name: "controller",
                ports: [
                  {
                    containerPort: 80,
                    hostPort: 80,
                    name: "http",
                    protocol: "TCP",
                  },
                  {
                    containerPort: 443,
                    hostPort: 443,
                    name: "https",
                    protocol: "TCP",
                  },
                ],
                readinessProbe: {
                  failureThreshold: 3,
                  httpGet: {
                    path: "/healthz",
                    port: 10254,
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  successThreshold: 1,
                  timeoutSeconds: 1,
                },
                resources: {
                  requests: {
                    cpu: "100m",
                    memory: "90Mi",
                  },
                },
                securityContext: {
                  allowPrivilegeEscalation: true,
                  capabilities: {
                    add: ["NET_BIND_SERVICE"],
                    drop: ["ALL"],
                  },
                  runAsUser: 101,
                },
              },
            ],
            dnsPolicy: "ClusterFirst",
            nodeSelector: {
              "ingress-ready": "true",
              "kubernetes.io/os": "linux",
            },
            serviceAccountName: "ingress-nginx",
            terminationGracePeriodSeconds: 0,
            tolerations: [
              {
                effect: "NoSchedule",
                key: "node-role.kubernetes.io/master",
                operator: "Equal",
              },
            ],
          },
        },
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "IngressClass",
      metadata: {
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": "ingress-nginx",
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
          "app.kubernetes.io/version": INGRESS_NGINX_CONTROLLER_VERSION,
        },
        annotations: {
          "ingressclass.kubernetes.io/is-default-class": "true",
        },
        name: "nginx",
      },
      spec: {
        controller: "k8s.io/ingress-nginx",
      },
    },
  ]
}
