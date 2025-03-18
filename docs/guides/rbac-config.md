---
order: 9
title: Minimal RBAC Configuration for Development Clusters
---

The following describes the minimal RBAC roles and permissions required for day-to-day use by developers for Garden when using the `kubernetes` plugin. These should be created along with the kubeconfig/kubecontext for the user in their namespace, replacing the `<username>`, `<service-accounts-namespace>` and `<project-namespace>` values as appropriate.

```yaml
---
# The user service account
apiVersion: v1
kind: ServiceAccount
metadata:
  name: user-<username>
  namespace: <service-accounts-namespace>

---

# Project namespaces
apiVersion: v1
kind: Namespace
metadata:
  name: <project-namespace>
  # Some required annotations
  annotations:
    garden.io/version: "0.11.3"

---

# Allow reading namespaces and persistent volumes, which are cluster-scoped
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: user-<username>
rules:
- apiGroups: [""]
  resources: ["namespaces", "persistentvolumes"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: user-<username>
  namespace: <service-accounts-namespace>
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: user-<username>
subjects:
- namespace: <service-accounts-namespace>
  kind: ServiceAccount
  name: user-<username>

---

# Full permissions within the <project-namespace>
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: <project-namespace>
  namespace: <project-namespace>
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: <project-namespace>
  namespace: <project-namespace>
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: <project-namespace>
subjects:
- namespace: <service-accounts-namespace>
  kind: ServiceAccount
  name: user-<username>

---

# Required access for the garden-system namespace
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: garden-system
  name: user-<username>-common
rules:
  # Allow storing and reading test results
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "create"]
  # Allow getting status of shared services
- apiGroups: [""]
  resources:
  - "configmaps"
  - "services"
  - "serviceaccounts"
  - "persistentvolumeclaims"
  - "pods/log"
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["configmaps", "services", "serviceaccounts"]
  verbs: ["get", "list"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["roles", "rolebindings"]
  verbs: ["get", "list"]
  # Note: We do not store anything sensitive in secrets, aside from registry auth,
  #       which users anyway need to be able to read and push built images.
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]

---

apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: user-<username>-common
  namespace: garden-system
roleRef:
  kind: Role
  name: user-<username>-common
  apiGroup: ""
subjects:
- namespace: <service-accounts-namespace>
  kind: ServiceAccount
  name: user-<username>
