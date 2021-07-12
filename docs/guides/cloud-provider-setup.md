# Cloud Provider Set-up

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

```sh
gcloud container clusters get-credentials [your-cluster-name]
```

to add an entry for your cluster to your local Kubernetes config.

If you run `kubectl config get-contexts`, the table shown should include a context with a `NAME` and `CLUSTER` equal to the cluster name you chose previously.

Select this context if it isn't already selected.

Run `kubectl get ns` to verify that you're able to connect to your cluster.

### Configure your Garden project

Now, configure your Garden project for connecting to your cluster. Add to project-level `garden.yml`:

```yaml
kind: Project
name: your-project
  - name: remote  # or any name of your choice
    providers:
      - name: kubernetes
        context: <name-of-your-gke-kubernetes-context>
        defaultHostname: your-project.yourdomain.com     # <- replace this with your intended ingress hostname
        buildMode: kaniko                                # <- (optional) enable in-cluster building
        setupIngressController: nginx                    # <- skip this if you want to install your own ingress controller
```

Run `garden --env=remote plugins kubernetes cluster-init`, then `garden dev --env=remote`. Now you should be good to go.

### Optional: Use in-cluster building with GCR and Kaniko

Take a look at the [gke example project](https://github.com/garden-io/garden/tree/0.12.24/examples/gke)) to see the additional steps required to set up in-cluster building on GKE with Kaniko and GCR as a deployment registry.

### Optional: Configure DNS

First, get the public IP address of the ingress controller you set up in the previous step. If you configured Garden to set up _nginx_, run: `kubectl describe service --namespace=garden-system garden-nginx-ingress-nginx-controller | grep 'LoadBalancer Ingress'` and make note of returned IP address.

Then, create a DNS record with your provider of choice, pointing at the IP address you wrote down in the previous step (e.g. an `A` record pointing your-project.your-domain.com at that IP). We recommend setting up a wildcard record as well (e.g *.your-project.your-domain.com).

> Note: Your IAM role may need to have permissions to create `clusterRoles` and `clusterRoleBindings`.

## AKS (Azure)

In AKS' web UI under **Kubernetes Services**, choose **Create Kubernetes Service**.

Fill out the project & cluster details.

Install Azure CLI tools (see https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest for platform-specific instructions).

Now run:

```sh
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
  - name: azure   # or any name of your choice
    providers:
      - name: kubernetes
        context: <name-of-your-azure-kubernetes-context>
        defaultHostname: your-project.yourdomain.com     # <- replace this with your intended ingress hostname
        buildMode: kaniko                              # <- (optional) enable in-cluster building
        setupIngressController: nginx                    # <- skip this if you want to install your own ingress controller
  - name: some-other-environment
    ...
```

Then, run

```sh
garden --env=azure plugins kubernetes cluster-init
```

and

```sh
garden --env=azure deploy
```

Now you should be good to go.

## AWS (EKS)

_Cluster creation & configuration guide coming soon!_

Once you have an EKS cluster set up, configure your Garden project to connect to it:

```yaml
kind: Project
name: your-project
environments:
  - name: eks   # or any name of your choice
    providers:
      - name: kubernetes
        context: <name-of-your-eks-kubernetes-context>
        defaultHostname: your-project.yourdomain.com     # <- replace this with your intended ingress hostname
        buildMode: kaniko                                # <- (optional) enable in-cluster building
        setupIngressController: nginx                    # <- skip this if you want to install your own ingress controller
  - name: some-other-environment
    ...
```

Then, run

```sh
garden --env=eks plugins kubernetes cluster-init
```

and finally

```sh
garden --env=eks deploy
```

In order to set up in-cluster building with an ECR registry, please refer to the [In-cluster Building](./in-cluster-building.md) guide, and specifically the section on [using in-cluster building with ECR](./in-cluster-building.md#using-in-cluster-building-with-ecr).

Note: In order to dynamically provision EBS/EFS volumes using `persistenvolumeclaim` modules, consult the [storage classes documentation](https://docs.aws.amazon.com/eks/latest/userguide/storage-classes.html) provided by AWS.

## AWS (kops)

[kops](https://github.com/kubernetes/kops) is a handy tool for creating Kubernetes clusters on AWS. Follow [these instructions](https://github.com/kubernetes/kops/blob/master/docs/getting_started/aws.md) to create your cluster.

After creating the cluster, kops will create a new `kubectl` context and set it as the active context. Note the name of the context and
create an environment for the cluster in your project `garden.yml`:

```yaml
# garden.yml
kind: Project
name: your-project
environments:
  - name: aws # or any name of your choice
    providers:
      - name: kubernetes
        context: <name-of-your-kops-kubernetes-context>
        defaultHostname: your-project.yourdomain.com     # <- replace this with your intended ingress hostname
        buildMode: kaniko                                # <- (optional) enable in-cluster building
        setupIngressController: nginx                    # <- skip this if you want to install your own ingress controller
    ...
```

Once the cluster is ready (use `kops validate cluster` to check its status), initialize it with

```sh
garden --env=aws plugins kubernetes cluster-init
```

then try running

```sh
garden --env=aws deploy
```

And that's it!
