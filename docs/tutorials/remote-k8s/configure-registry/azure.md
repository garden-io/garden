---
title: Azure
order: 3
---

# Azure

## Setting up a registry

Follow [this guide](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-get-started-portal?tabs=azure-cli) to create a private Azure container registry on Azure portal.

Then follow [this guide](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-auth-kubernetes) to create an image pull secret so that your cluster can pull images from your registry.

Make note of the ImagePullSecret name and namespace.

