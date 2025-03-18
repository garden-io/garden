---
title: Azure
order: 4
---

# Azure

## AKS

In AKS' web UI under **Kubernetes Services**, choose **Create Kubernetes Service**.

Fill out the project & cluster details.

Install Azure CLI tools (see [the official docs](https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest) for platform-specific instructions).

Now run:

```sh
az login
az aks get-credentials --resource-group [your resource group] --name [your cluster name]
```

This will merge an entry for your Azure cluster into your local Kubernetes config.

If you run `kubectl config get-contexts`, the table shown should include a context with a `NAME` and `CLUSTER` equal to the cluster name you chose previously.

Select this context if it isn't already selected.

Run `kubectl get ns` to verify that you're able to connect to your Azure cluster.

