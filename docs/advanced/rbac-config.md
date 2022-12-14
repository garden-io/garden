---
order: 4
title: Minimal RBAC Configuration for Development Clusters
---

If there is no dedicated development k8s cluster, the following configurations can be used to limit the permissions, of developers on a shared cluster using RBAC (Role-Based Access Control), to specific dev namespaces only. This can help to ensure that developers have the appropriate access to resources on the shared cluster.

> We have verified to ensure that the following configuration is effective for an Azure IAM group that includes all developers. Similar approach can be followed for any other k8s group mapping. (Contributions, to this doc, are welcome)

In order to achieve scoped permissions for desired namespaces only, we are using benefits of [hierarchical namespaces](https://kubernetes.io/blog/2020/08/14/introducing-hierarchical-namespaces/)

1. Install hierarchical namespace controller in the k8s cluster.
    ```
    kubectl apply -f https://github.com/kubernetes-sigs/hierarchical-namespaces/releases/download/v1.0.0/default.yaml
    ```
2.  Create an Azure IAM group for the developers who are allowed to deploy to dev namespaces only. Add all the Users to the group and note the group ID.

3. Create a root namespace (`webdev-root` for example) which will have a role that can be inherited by sub-namespaces (all dev namespaces).

4. Create a clusterRole and ClusterRoleBinding.
    ```
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRole
    metadata:
      name: namespacesAndPVCsCreateAndList
    rules:
    - apiGroups:
      - ""
      resources:
      - namespaces
      - persistenvolumes
      verbs:
      - create
      - get
      - list
      - watch
    ---

    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRoleBinding
    metadata:
      name: webdevsClusterRoleBinding
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: ClusterRole
      name: namespacesAndPVCsCreateAndList
    subjects:
    - apiGroup: rbac.authorization.k8s.io
      kind: Group
      name: <Azure IAM group ID>
    ```
5. Create a Role and RoleBinding in the root namespace (`webdev-root` for example). This will allow all the members of group to have full access to all sub-namespaces.
    ```
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      name: webdevNamespacesFullAccess
      namespace: webdev-root
    rules:
      - apiGroups: ["*"]
        resources: ["*"]
        verbs: ["*"]
    ---

    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      name: webdevsRoleBinding
      namespace: webdev-root
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: webdevNamespaceFullAccess
    subjects:
    - apiGroup: rbac.authorization.k8s.io
      kind: Group
      name: <Azure IAM group ID>
    ```
6. Create Role and RoleBinding for providing full access to `garden-system namespace`.
    ```
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      name: gardenSystemFullAccess
      namespace: garden-system
    rules:
      - apiGroups: ["*"]
        resources: ["*"]
        verbs: ["*"]
    ---

    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      name: gardenSystemFullAccessRoleBinding
      namespace: garden-system
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: gardenSystemFullAccess
    subjects:
    - apiGroup: rbac.authorization.k8s.io
      kind: Group
      name: <Azure IAM group ID>
    ```

7. Update project.garden.yaml in order to make sure that sub-namespaces have an annotation (`hnc.x-k8s.io/subnamespace-of: webdev-root` for example) of root namespace where permissions are inherited from.
    ```
    kind: Project
    name: demo-project

    # defaultEnvironment: "remote" # Uncomment if the remote environment is preferred to be the default for this project.

    environments:
      - name: local
      - name: remote
        defaultNamespace: webdev-${var.userId}
    providers:
      - name: local-kubernetes
        environments: [local]
      - name: kubernetes
        environments: [remote]
        # Replace the below values as appropriate
        context: rbac-test
        namespace:
          name: webdev-${var.userId}
          annotations:
            hnc.x-k8s.io/subnamespace-of: webdev-root
        defaultHostname: webdev-${var.userId}.sys.garden
        buildMode: kaniko
        deploymentRegistry:
          hostname: eu.gcr.io    # <- set this according to the region in which k8s cluster runs
          namespace: garden-demo-324810
        imagePullSecrets:
          # Make sure this matches with the name and namespace of the imagePullSecret created to authenticate with the registry (if needed)
          - name: gcr-json-key
            namespace: webdev-root
    variables:
      userId: ${local.username}
    ```
