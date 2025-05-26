---
title: GCP
order: 2
---

# GCP

## Setting up a GCR registry

Follow [this guide](https://cloud.google.com/container-registry/docs/quickstart) to create a private GCR registry on GCP.

Then follow [this guide](https://kubernetes.io/docs/concepts/containers/images/#using-a-private-registry) to create an image pull secret
so that your cluster can pull images from your registry.

Make note of the ImagePullSecret name and namespace.

## Enabling in-cluster building with GCR

To use in-cluster building with GCR (Google Container Registry) you need to set up authentication, with the following steps:

1. Create a Google Service Account (GSA).
2. Give the GSA the appropriate permissions.
3. Create a JSON key for the account.
4. Create an _imagePullSecret_ for using the JSON key.
5. Add a reference to the imagePullSecret in your Garden project configuration.

First, create a Google Service Account:

```sh
# You can replace the gcr-access name of course, but make sure you also replace it in the commands below
gcloud iam service-accounts create gcr-access --project ${PROJECT_ID}
```

Then, to grant the Google Service account the right permission to push to GCR, run the following gcloud commands:

```sh
# Create a role with the required permissions
gcloud iam roles create gcrAccess \
  --project ${PROJECT_ID} \
  --permissions=storage.objects.get,storage.objects.create,storage.objects.list,storage.objects.update,storage.objects.delete,storage.buckets.create,storage.buckets.get

# Attach the role to the newly create Google Service Account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gcr-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=projects/${PROJECT_ID}/roles/gcrAccess
```

Next create a JSON key file for the GSA:

```sh
gcloud iam service-accounts keys create keyfile.json --iam-account gcr-access@${PROJECT_ID}.iam.gserviceaccount.com
```

Then prepare the _imagePullSecret_ in your Kubernetes cluster. Run the following command, if appropriate replacing `gcr.io` with the correct registry hostname (e.g. `eu.gcr.io` or `asia.gcr.io`):

```sh
kubectl --namespace default create secret docker-registry gcr-config \
  --docker-server=gcr.io \
  --docker-username=_json_key \
  --docker-password="$(cat keyfile.json)"
```

Finally, make note of the ImagePullSecret name and
namespace.

## Enabling in-cluster building with Google Artifact Registry

To use in-cluster building with Google Artifact Registry you need to set up authentication, with the following steps:

1. Create a Google Service Account (GSA).
2. Give the GSA the appropriate permissions.
3. Create a JSON key for the account.
4. Create an _imagePullSecret_ for using the JSON key.
5. Add a reference to the imagePullSecret to your Garden project configuration.

First, create a Google Service Account:

```sh
# Of course you can replace the gar-access name, but make sure you also replace it in the commands below.
gcloud iam service-accounts create gar-access --project ${PROJECT_ID}
```

The service account needs write access to the Google Artifacts Registry. You can either grant write access to all repositories with an IAM policy, or you can grant repository-specific permissions to selected repositories. We recommend the latter, as it follows the pattern of granting the least-privileged access needed.

To grant access to all Google Artifact Registries, run:

```sh
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

To grant access to one or more repositories, run for each repository:

```sh
gcloud artifacts repositories add-iam-policy-binding ${REPOSITORY} \
  --location=${REGION} \
  --member=serviceAccount:gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

Next create a JSON key file for the GSA:

```sh
gcloud iam service-accounts keys create keyfile.json --iam-account gar-access@${PROJECT_ID}.iam.gserviceaccount.com
```

Then prepare the _imagePullSecret_ in your Kubernetes cluster. Run the following command and replace `docker.pkg.dev` with the correct registry hostname (e.g. `southamerica-east1-docker.pkg.dev` or `australia-southeast1-docker.pkg.dev`):

```sh
kubectl --namespace default create secret docker-registry gar-config \
  --docker-server=docker.pkg.dev \
  --docker-username=_json_key \
  --docker-password="$(cat keyfile.json)"
```

Finally, make note of the ImagePullSecret name and
namespace.

