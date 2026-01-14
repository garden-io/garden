# gke project

A variant on the `demo-project` example, with an example configuration for GKE with in-cluster building with Kaniko or BuildKit.

Two environments are configured, `gke-kaniko` and `gke-buildkit`. The first uses Kaniko for in-cluster builds, the latter uses BuildKit. The example is set up to use GCR as the deployment registry.

## Setup

### Step 1 - Install the Google Cloud SDK and authenticate

If you haven't already, follow the instructions [here](https://cloud.google.com/sdk/docs/quickstarts) to install the `gcloud` tool, and authenticate with GCP:

```sh
gcloud auth application-default login
```

### Step 2 - Set up a GCP project

Choose a project ID for the demo project and run the following (skip individual steps as appropriate):

```sh
export PROJECT_ID=<id>
# (Skip if you already have a project)
gcloud projects create $PROJECT_ID
# If you haven't already, enable billing for the project (required for the APIs below).
# You need an account ID (of the form 0X0X0X-0X0X0X-0X0X0X) to use for billing.
gcloud alpha billing projects link $PROJECT_ID --billing-account=<account ID>
# Enable the required APIs (this can sometimes take a while).
gcloud services enable compute.googleapis.com container.googleapis.com servicemanagement.googleapis.com --project $PROJECT_ID
```

### Step 2 - Create a GKE cluster (if you don't already have one)

See the general GKE instructions [here](https://cloud.google.com/kubernetes-engine/docs/how-to/creating-a-zonal-cluster).

### Step 3 - Create and configure a Google Service Account (GSA) and role

First, create a Google Service Account:

```sh
# You can replace the gcr-access name of course, but make sure you also replace it in the commands below
gcloud iam service-accounts create gcr-access --project ${PROJECT_ID}
```

Then, to grant the Google Service account the right permission to push to GCR, run the following GCR commands:

```sh
# Create a role with the required permissions
gcloud iam roles create gcrAccess \
  --project ${PROJECT_ID} \
  --permissions=storage.objects.get,storage.objects.create,storage.objects.list,storage.objects.update,storage.objects.delete,storage.buckets.create,storage.buckets.get

# Attach the role to the newly create Google Service Account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gcr-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role==projects/${PROJECT_ID}/roles/gcrAccess
```

### Step 4 - Get a JSON key and create an imagePullSecret

You'll need to prepare the authentication for the builders to use when pulling from and pushing to GCR.

First create a JSON key file for the GSA:

```sh
gcloud iam service-accounts keys create keyfile.json --iam-account gcr-access@${PROJECT_ID}.iam.gserviceaccount.com
```

Then prepare the _imagePullSecret_ in your Kubernetes cluster. Run the following command, if appropriate replacing `gcr.io` with the correct registry hostname (e.g. `eu.gcr.io` or `asia.gcr.io`):

```sh
kubectl --namespace default create secret docker-registry regcred \
  --docker-server=gcr.io \
  --docker-username=_json_key \
  --docker-password="$(cat keyfile.json)"
```

### Step 5 - Set the variables in the project config

You'll need to replace the values under the `variables` keys in the `garden.yml` file, as instructed in the comments in the file.

You can optionally set up an ingress controller in the cluster and point a DNS hostname to it, and set that under `variables.default-hostname`.

## Usage

### Deploy your services

Finally, to build and deploy your services to your new GKE cluster, run:

```sh
# Choose which environment to deploy with the --env parameter
garden deploy --env=<gke-kaniko|gke-buildkit>
```
