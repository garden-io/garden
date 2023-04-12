# Garden - Helm - ArgoCD


__TL;DR__

1. Developers use Garden for "inner loop" develop and push their changes to GitHub.
2. Once changes are approved and merged to then `main` branch, a GitHub action is triggered that pushes images via the `garden publish` command.
3. ArgoCD image updater picks the updated tag and commits it back to GitHub repo. This new tag will be written to `api/chart/.argocd-source-api.yaml`.
4. ArgoCD watches the GitHub repo for new commits and sync's new images to the Prod cluster.

## Overview

This example is based on a traditional 3-tier app with `web`, `api` and `postgres` services.

This implementation requires two Kubernetes clusters; one of which is a Dev/CI cluster while the other is a Prod cluster. Garden is used to start development environments and trigger CI jobs in the Dev/CI cluster while ArgoCD is used for production deployments in the Prod cluster. Container images are built via Garden's in-cluster building functionality in the Dev/CI cluster and pushed to the respective repositories. In this example, we're using Dockerhub as our container registry.

Purpose of Dev/CI cluster is to have resources deployed via `garden` during development (remote development environment on top on Kubernetes) and CI phases  while Prod cluster gets deployments sync'd via ArgoCD. Dev cluster has an in-cluster builder that will help with building service related container images and pushing them to respective container repositories. A dockerhub registry has been used.

Argocd image updater helps with actively watching the container repos for new image builds and then creates a commit back to the GitHub repo with the image tag. Image tags are filtered based on `update-strategy` annotated in the ArgoCD application definition. For example, `api`'s definition will have the annotations referenced below that help image updater to pick the right tag.
```yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=gardendev/api-image # update according to your registry-namespace/image
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
    argocd-image-updater.argoproj.io/api.update-strategy: name
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^main-[0-9]+$ # update according to your image tag
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
...
```

Once the right tag (in this case `main-27`) has been identified, image updater creates a commit and updated the tag under `api/chart/.argocd-source-api.yaml`
```yaml
helm:
  parameters:
  - name: image.repository
    value: gardendev/api-image # image-updater updates accordingly
    forcestring: true
  - name: image.tag
    value: main-27 # image-updater updates accordingly
    forcestring: true
```
ArgoCD image updater by default uses the same repo credential that ArgoCD would use, to commit above changes. We use a GitHub App that has been installed on the repo.

ArgoCD watches updates to the GitHub repo. Once the image tag has been updated, changes are sync'd via the [App of apps](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/#app-of-apps-pattern) pattern. 

In the current example; A dedicated `values-prod.yaml` file has been created per service, which will be used by ArgoCD to overwrite default values and then sync to the Prod cluster.

## Setup
- To get started, set up two GKE clusters - one for development and continuous integration (Dev/CI) and another for production (Prod). Refer to our comprehensive documentation for detailed instructions on using the [remote Kubernetes plugin](https://docs.garden.io/kubernetes-plugins/remote-k8s) with Garden.io.
- For the __api__ and __web__ services, create repositories on Docker Hub to simplify the deployment process.
- For ease of use, we'll be using the same cluster for both the Dev and CI workloads. However, you can also choose to use separate clusters depending on your requirements.

### Dev
- Add required ImagePullSecrets and initialize dev cluster with garden along with buildkit in-cluster builder via kubernetes provider
- Deploy services to the Dev cluster via `garden deploy --env=gke-gitops-dev`

### CI
- When the app works as expected, commit changes to VCS, we use GitHub for this example. Once changes are pushed to `main` branch, GitHub Workflow gets triggered which will publish images to the registry using `garden publish`. By default images get tagged with the module version that garden calculates for us, however we use `branchName-runNumber` as the tag.
- After publish, we delete the CI related services to conserve our resources on the cluster

### Prod
- Install ArgoCD on Prod cluster using helm

  ```
  helm repo add argo https://argoproj.github.io/argo-helm
  helm repo update
  helm -n argocd install argocd argo/argo-cd --version 5.13.5 --create-namespace
  ```
- Create [argocd-applications](https://github.com/garden-io/garden/tree/main/examples/argocd/argocd-applications) which contains all the manifests that will help with sync'ing apps on prod cluster via ArgoCD
- (Optional) Install ingress-nginx controller
- Apply necessary annotations to the ArgoCD app, in this case for the `api` and `web` so that argocd-image-updater looks for newest image builds on container repo that match the `update-strategy`. Example configuration for `api` Argocd Application is as below:
  ```yaml
  ---
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: api
    namespace: argocd
    annotations:
      argocd-image-updater.argoproj.io/image-list: api=gardendev/api-image # update according to your registry-namespace/image
      argocd-image-updater.argoproj.io/write-back-method: git
      argocd-image-updater.argoproj.io/git-branch: main
      argocd-image-updater.argoproj.io/api.update-strategy: name
      argocd-image-updater.argoproj.io/api.allow-tags: regexp:^main-[0-9]+$ # update according to your image tag
      argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
      argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
  ...
  ```

### Trigger ArgoCD sync
- Make a change in the api service code
- Commit changes to GitHub repo, this will trigger a GitHub workflow(CI) run that publishes `api-image` to container repository.
- `argocd-image-updater` tracks the published build and updates it when it matches the `update-strategy`. Image updater uses `[skip ci]` in the commit message templates in order to avoid an infinite loop.
- Once `.argocd-source-api.yaml` has been updated with the newest `image.tag`, ArgoCD syncs those changes back to the `api` service on Prod cluster.
- Changes to `web` service are also rolled out to Prod in a similar way as of `api` service.
