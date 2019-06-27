# Cloud provider setup

Below you'll find guides for creating and configuring a Kubernetes cluster with a few
prominent providers of hosted, managed Kubernetes clusters, and configuring your Garden
project for connecting to your cluster.

Let us know on [#garden on Kubernetes Slack](https://kubernetes.slack.com/messages/garden) if you'd like guides for more providers.

## GKE (Google)

### Create a project and a cluster

First, follow the steps in [GKE's quickstart guide](https://cloud.google.com/kubernetes-engine/docs/quickstart?authuser=1) to create a project (if you haven't already) and a Kubernetes cluster.

You can create a cluster either using the `gcloud` CLI tool, or through the
web UI—whichever you find more convenient.

> Note: If `gcloud` throws unexpected permission-related errors during this process,
make sure you've been authenticated via `gcloud auth login`.

Make sure to run
```
gcloud container clusters get-credentials [your-cluster-name]
```
to add an entry for your cluster to your local Kubernetes config.

If you run `kubectl config get-contexts`, the table shown should include a context with a `NAME` and `CLUSTER` equal to the cluster name you chose previously.

Select this context if it isn't already selected.

Run `kubectl get ns` to verify that you're able to connect to your cluster.

### Configure DNS

Next, run `gcloud container clusters list`, and write down the `MASTER_IP` for the
cluster you've just created.

Then, create a DNS record with your provider of choice, pointing at the IP address you
wrote down in the previous step (e.g. an `A` record pointing that IP address at
your-project.your-domain.com).

### Configure your Garden project

Now, configure your Garden project for connecting to your cluster. Add to project-level `garden.yml`:
```yaml
  - name: remote # Or any other name you prefer
    providers:
      - name: kubernetes
        context: <name-of-your-gke-kubernetes-context>
        namespace: []
        defaultHostname: your-project.your-domain.com
        buildMode: cluster-docker # Uses in-cluster building
        setupIngressController: nginx
```
Run `garden --env remote plugins kubernetes cluster-init`, then `garden dev --env remote `. Now you should be good to go.

> Note: Your IAM role may need to have permissions to create `clusterRoles` and `clusterRoleBindings`.


## AKS (Azure)

In AKS' web UI under **Kubernetes Services**, choose **Create Kubernetes Service**.

Fill out the project & cluster details.

Install Azure CLI tools (see https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest for platform-specific instructions).

Now run:
```
az login
az aks get-credentials --resource-group [your resource group] --name [your cluster name]
```

This will merge an entry for your Azure cluster into your local Kubernetes config.

If you run `kubectl config get-contexts`, the table shown should include a context with a `NAME` and `CLUSTER` equal to the cluster name you chose previously.

Select this context if it isn't already selected.

Run `kubectl get ns` to verify that you're able to connect to your Azure cluster.

Find the public IP address of the load balancer associated with your cluster under **Load Balancers**. Point a DNS entry at this IP address using your DNS provider of choice (we'll assume it is your-project.yourdomain.com in the config below).

Then, your project configuration should look something like this (insert the relevant values instead of the placeholders below):

```yaml
kind: Project
name: your-project
environments:
  - name: azure
    providers:
      - name: kubernetes
        context: <name-of-your-azure-kubernetes-context>
        defaultHostname: your-project.yourdomain.com
        buildMode: cluster-docker # Uses in-cluster building
        setupIngressController: nginx
  - name: some-other-environment
    ..
```
Then, run 
```
garden --env azure kubernetes cluster-init
```
and
```
garden deploy --env azure
```
Now you should be good to go.

## EKS (Amazon)

Cluster creation & configuration guide coming soon.

Once you have an EKS cluster set up, configure your Garden project to connect to it:
```yaml
kind: Project
name: your-project
environments:
  - name: eks # or any name of your choice
    providers:
      - name: kubernetes
        context: <name-of-your-eks-kubernetes-context>
        defaultHostname: your-project.yourdomain.com
        buildMode: cluster-docker # Uses in-cluster building
        setupIngressController: nginx
  - name: some-other-environment
    ..
```
Then, run
```
garden --env azure kubernetes cluster-init
```
and
```
garden deploy --env azure
```
Now you should be good to go.