# Terraform + GKE example

This example takes the [demo project](../demo-project) and sets it up for use with a GKE cluster, using Terraform.

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

### Step 3 - Set your stack variables

The Terraform stack needs some input values from you. You can provide those in a couple of different ways:

**A)** Supply the values in a `terraform.tfvars` file in the example root directory. For example:

```tfvars
# terraform.tfvars
region     = "europe-west1"°
project_id = "my-test-project"
```

**B)** Configure the variables directly in the project `garden.yml` (see the `terraform` provider section).

### Step 4 - Deploy your stack

Finally, build and deploy your GKE cluster and services to the new cluster:

```sh
garden deploy -l2 #the -l2 flag is optional, but recommended to observe the progress of the Terraform deployment
```

And that's it!

## Cleanup

Simply delete your GCP project, and the Terraform state:

```sh
gcloud projects delete $PROJECT_ID
rm -rf .terraform terraform.tfstate
```
