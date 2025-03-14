---
title: 4. Retrieve Kubeconfig (optional)
order: 4
---

# 4. Retrieve Kubeconfig (optional)

Once your ephemeral cluster is created, the kubeconfig file for that cluster is stored on your local machine. The path to the kubeconfig file is shown in the logs when you deploy your project using Garden and looks like the following:
```
kubeconfig for ephemeral cluster saved at path: /garden/examples/ephemeral-cluster-demo/.garden/ephemeral-kubernetes/<cluster-id>-kubeconfig.yaml
```

This kubeconfig file allows you to interact with the cluster using `kubectl` or other Kubernetes tools.
