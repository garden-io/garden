# Local Path Provisioner

[Local Path Provisioner](https://github.com/rancher/local-path-provisioner) provides a way for the Kubernetes users to
utilize the local storage in each node. Based on the user configuration, the Local Path Provisioner will create
`hostPath` based persistent volume on the node automatically. It utilizes the features introduced by Kubernetes [Local
Persistent Volume feature](https://kubernetes.io/blog/2018/04/13/local-persistent-volumes-beta/), but make it a simpler
solution than the built-in `local` volume feature in Kubernetes.

## TL;DR;

```console
$ git clone https://github.com/rancher/local-path-provisioner.git
$ cd local-path-provisioner
$ helm install --name local-path-storage --namespace local-path-storage ./deploy/chart/
```

## Introduction

This chart bootstraps a [Local Path Provisioner](https://github.com/rancher/local-path-provisioner) deployment on a
[Kubernetes](http://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager.

## Prerequisites

- Kubernetes 1.12+ with Beta APIs enabled

## Installing the Chart

To install the chart with the release name `local-path-storage`:

```console
$ git clone https://github.com/rancher/local-path-provisioner.git
$ cd local-path-provisioner
$ helm install ./deploy/chart/ --name local-path-storage --namespace local-path-storage
```

The command deploys Local Path Provisioner on the Kubernetes cluster in the default configuration. The
[configuration](#configuration) section lists the parameters that can be configured during installation.

> **Tip**: List all releases using `helm list`

## Uninstalling the Chart

To uninstall/delete the `local-path-storage` deployment:

```console
$ helm delete --purge local-path-storage
```

The command removes all the Kubernetes components associated with the chart and deletes the release.

## Configuration

The following table lists the configurable parameters of the Local Path Provisioner for Kubernetes chart and their
default values.

| Parameter                           | Description                                                                     | Default                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `image.repository`                  | Local Path Provisioner image name                                               | `rancher/local-path-provisioner`                                                    |
| `image.tag`                         | Local Path Provisioner image tag                                                | `v0.0.11`                                                                            |
| `image.pullPolicy`                  | Image pull policy                                                               | `IfNotPresent`                                                                      |
| `storageClass.create`               | If true, create a `StorageClass`                                                | `true`                                                                              |
| `storageClass.provisionerName`      | The provisioner name for the storage class                                      | `nil`                                                                               |
| `storageClass.defaultClass`         | If true, set the created `StorageClass` as the cluster's default `StorageClass` | `false`                                                                             |
| `storageClass.name`                 | The name to assign the created StorageClass                                     | local-path                                                                          |
| `storageClass.reclaimPolicy`        | ReclaimPolicy field of the class                                                | Delete                                                                              |
| `nodePathMap`                       | Configuration of where to store the data on each node                           | `[{node: DEFAULT_PATH_FOR_NON_LISTED_NODES, paths: [/opt/local-path-provisioner]}]` |
| `resources`                         | Local Path Provisioner resource requests & limits                               | `{}`                                                                                |
| `rbac.create`                       | If true, create & use RBAC resources                                            | `true`                                                                              |
| `serviceAccount.create`             | If true, create the Local Path Provisioner service account                      | `true`                                                                              |
| `serviceAccount.name`               | Name of the Local Path Provisioner service account to use or create             | `nil`                                                                               |
| `nodeSelector`                      | Node labels for Local Path Provisioner pod assignment                           | `{}`                                                                                |
| `tolerations`                       | Node taints to tolerate                                                         | `[]`                                                                                |
| `affinity`                          | Pod affinity                                                                    | `{}`                                                                                |

Specify each parameter using the `--set key=value[,key=value]` argument to `helm install`. For example,

```console
$ helm install ./deploy/chart/ --name local-path-storage --namespace local-path-storage --set storageClass.provisionerName=rancher.io/local-path
```

Alternatively, a YAML file that specifies the values for the above parameters can be provided while installing the
chart. For example,

```console
$ helm install --name local-path-storage --namespace local-path-storage ./deploy/chart/ -f values.yaml
```

> **Tip**: You can use the default [values.yaml](values.yaml)

## RBAC

By default the chart will install the recommended RBAC roles and rolebindings.

You need to have the flag `--authorization-mode=RBAC` on the api server. See the following document for how to enable
[RBAC](https://kubernetes.io/docs/admin/authorization/rbac/).

To determine if your cluster supports RBAC, run the following command:

```console
$ kubectl api-versions | grep rbac
```

If the output contains "beta", you may install the chart with RBAC enabled (see below).

### Enable RBAC role/rolebinding creation

To enable the creation of RBAC resources (On clusters with RBAC). Do the following:

```console
$ helm install ./deploy/chart/ --name local-path-storage --namespace local-path-storage --set rbac.create=true
```
