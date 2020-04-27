# gke project

A variant on the `demo-project` example, with an example configuration for GKE with in-cluster building with Kaniko.

Two environments are configured, `gke-kaniko` and `gke-kaniko-gcr`. Both use Kaniko for in-cluster builds, but the latter uses GCR as a deployment registry (which is often preferable to deploying an in-cluster registry).

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

If you don't already have a GKE cluster to work with, you can create one like this:

```sh
# Replace the cluster name as you see fit, of course.
# The --workload-pool flag makes sure Workload Identity is enabled for the cluster.
gcloud container clusters create garden-gke-example --workload-pool=${PROJECT_ID}.svc.id.goog
```

You can of course also use the GKE console to do this or add many configuration parameters with the command line, **just make sure _Workload Identity_ is enabled when you create the cluster** (note the `--workload-pool` flag in the above example). See the general GKE instructions [here](https://cloud.google.com/kubernetes-engine/docs/how-to/creating-a-zonal-cluster).

### Step 3 - Configure Workload Identity

For Kaniko to be able to seamlessly authenticate with your GCR registry, you need to use _Workload Identity_ and give the service account in the `garden-system` namespace access to the GCR registry through that.

To quote the [Kaniko docs](https://github.com/GoogleContainerTools/kaniko#pushing-to-gcr-using-workload-identity) on the subject:

> To authenticate using workload identity you need to run the kaniko pod using a Kubernetes Service Account (KSA) bound to Google Service Account (GSA) which has Storage.Admin permissions to push images to Google Container registry.

In our case, we will use the existing `default` service account in the `garden-system` namespace.

Follow these steps to set all this up:

#### Make sure Workload Identity is enabled for your cluster

If you're using an existing cluster, please see the GKE docs for how to [enable Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity#enable_on_cluster).
You'll need the cluster to have Workload Identity enabled, and for your node pools to have it enabled as well.

#### Create and configure a Google Service Account (GSA)

Please follow the detailed steps [here](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity#authenticating_to) **(noting that you should skip creating a new Kubernetes service account and instead attach to the `default` service account in the `garden-system` namespace)** to create a Google Service Account and an IAM policy binding between the GSA and the Kubernetes Service account to allow it to act as the Google service account.

Then, to grant the Google Service account the right permission to push to GCR, run the following GCR commands (replacing `[google-service-account-name]` with your new GSA name):

```sh
# Create a role with the required permissions
gcloud iam roles create gcrAccess \
  --project ${PROJECT_ID} \
  --permissions=storage.objects.get,storage.objects.create,storage.objects.list,storage.objects.update,storage.objects.delete,storage.buckets.create,storage.buckets.get

# Attach the role to the newly create Google Service Account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:[google-service-account-name]@${PROJECT_ID}.iam.gserviceaccount.com \
  --role==projects/${PROJECT_ID}/roles/gcrAccess
```

### Step 4 - Set the variables in the project config

Simply replace the values under the `variables` keys in the `garden.yml` file, as instructed in the comments in the file.

You can optionally set up an ingress controller in the cluster and point a DNS hostname to it, and set that under `variables.default-hostname`.

### Step 5 - Initialize the cluster

Install the cluster-wide services Garden needs by running:

```sh
garden plugins kubernetes cluster-init --env=<gke-kaniko|gke-kaniko-gcr>
```

## Usage

### Deploy your services

Finally, to build and deploy your services to your new GKE cluster, run:

```sh
# Choose which environment to deploy with the --env parameter
garden deploy --env=<gke-kaniko|gke-kaniko-gcr>
```
