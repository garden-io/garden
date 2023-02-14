# gitops-demo


__TL;DR__

1. Dev uses garden in the development environment and is happy with the changes made to the `api` service.
2. Runs `garden publish api-image` to push new image to the container registry
3. ArgoCD image updater picks the updated tag and commits it back to the Github repo
4. ArgoCD watches the Github repo for new commits and syncs the tag on Prod cluster

## Overview

This example is based on a traditional:tm: 3-tier app with `web`, `api` and `postgres` services.

This implementation requires two k8s clusters; one of which is a Dev cluster while the other is a Prod cluster. Purpose of Dev cluster is to have resources deployed via `garden` during development phases (remote development environment on top on Kubernetes) while Prod cluster gets deployments sync'd via ArgoCD. Dev cluster has an in-cluster builder that will help with building service related container images and pushing them to container registry. A dockerhub registry has been used.

Argocd image updater helps with actively watching the container repos for new image builds and then creates a commit back to the github repo with the image tag.

ArgoCD watches updates to the github repo and changes to services are sync'd via the [App of apps](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/#app-of-apps-pattern) pattern. ArgoCD image updater by default uses the same repo credential that ArgoCD would use, which in this case is a Github App that has been installed on the repo.

For this case; A dedicated `values-prod.yaml` file has been created per service, which will be used by ArgoCD to overwrite default values and then sync to the Prod cluster.

## Setup
- Bring two (Dev and Prod) GKE clusters up.
- Create dockerhub repos for __api__ and __web__ services.

### Dev
- Add required ImagePullSecrets and initialize dev cluster with garden along with buildkit in-cluster builder via kubernetes provider
- Deploy services to the Dev cluster via `garden deploy --env=gke-gitops-dev`
- When the app works as expected, publish images to the registry using `garden publish`, By default images get tagged with the module version that garden calculates for us.

### Prod
- Install ArgoCD on Prod cluster using helm

  ```
  helm repo add argo https://argoproj.github.io/argo-helm
  helm repo update
  helm -n argocd install argocd argo/argo-cd --version 5.13.5 --create-namespace
  ```
- Create [argod-applications](https://github.com/garden-io-testing/gitops-demo/tree/main/argocd-applications) which contains all the manifests that will help with sync'ing apps on prod cluster via ArgoCD
- (Optional) Install ingress-nginx controller
- Apply necessary annotations to the ArgoCD app, in this case for the `api` and `web` so that argocd-image-updater looks for newest image builds on container repo. Example configuration for `api` Argocd Application is as below:
  ```
  ---
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: api
    namespace: argocd
    annotations:
      argocd-image-updater.argoproj.io/image-list: api=srihasg/api-image
      argocd-image-updater.argoproj.io/write-back-method: git
      argocd-image-updater.argoproj.io/git-branch: main
      argocd-image-updater.argoproj.io/api.update-strategy: newest-build
      argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
      argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
  ```

### Trigger ArgoCD sync
- Make a change in the api service code
- Publish the image `garden publish api-image` (for the demo, it was done manually on the workstation, however this can easily be a step in the CI pipeline)
- argocd-image-updater tracks the published build and updates it. On a successful commit back to the repo
- Once `.argocd-source-api.yaml` has been updated with the newest `image.tag`, ArgoCD syncs those changes back to the `api` service on Prod cluster.
- Services apart from `api` are not tracked via argocd-image-updater, hence a manual git commit with image tag triggers their respective ArgoCD sync.
