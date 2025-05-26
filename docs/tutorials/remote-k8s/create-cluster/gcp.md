---
title: GCP
order: 3
---

# GCP

## Create a project and a cluster

First, follow the steps in [GKE's quickstart guide](https://cloud.google.com/kubernetes-engine/docs/quickstart?authuser=1) to create a project (if you haven't already) and a Kubernetes cluster.

You can create a cluster either using the `gcloud` CLI tool, or through the
web UI—whichever you find more convenient.

> Note: If `gcloud` throws unexpected permission-related errors during this process,
make sure you've been authenticated via `gcloud auth login`.

Make sure to run

```sh
gcloud container clusters get-credentials [your-cluster-name]
```

to add an entry for your cluster to your local Kubernetes config.

If you run `kubectl config get-contexts`, the table shown should include a context with a `NAME` and `CLUSTER` equal to the cluster name you chose previously.

Select this context if it isn't already selected.

Run `kubectl get ns` to verify that you're able to connect to your cluster.

## Permissions

When using a GKE cluster with Garden, you can use the following [predefined roles](https://cloud.google.com/kubernetes-engine/docs/how-to/iam#predefined):
* Kubernetes Engine Developer
* Kubernetes Engine Cluster Viewer

These roles allow users to list all GKE clusters in a project and access the Kubernetes API and objects inside clusters.

To ensure that developers only have access to a single kubernetes cluster, create a separate project for that cluster.
