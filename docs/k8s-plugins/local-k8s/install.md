---
title: 1. Install Local Kubernetes
order: 1
---

# 1. Install Local Kubernetes

### Docker Desktop

[Docker Desktop](https://docs.docker.com/engine) is our recommended option for local Kubernetes on Mac and Windows.

Please refer to their [installation guide](https://docs.docker.com/engine/installation/) for how to download and install it (which is a pretty simple process).

_Note: If you have an older version installed, you may need to update it in order to enable Kubernetes support._

Once installed, open Docker Desktop's preferences, go to the Kubernetes section, tick `Enable Kubernetes` and save.

### MicroK8s

Garden can be used with [MicroK8s](https://microk8s.io) on supported Linux platforms.

To install it, please follow [their instructions](https://microk8s.io/docs/).

Once installed, you need to add the `microk8s` configuration to your `~/.kube/config` so that Garden knows how to access your cluster. We recommend exporting the config like this:

```sh
microk8s config > $HOME/.kube/microk8s.config
```

And then adding this to your `.bashrc`/`.zshrc`:

```sh
export KUBECONFIG=$HOME/.kube/microk8s.config:${KUBECONFIG:-$HOME/.kube/config}
```

You also need to ensure microk8s commands can be run by the user that's running Garden, so that Garden can get its status and enable required extensions if necessary. To do this, add your user to the `microk8s` group:

```sh
sudo usermod -a -G microk8s $USER   # or replace $USER with the desired user, if it's not the current user
```

Note that in-cluster building is currently not supported with microk8s clusters.

### Minikube

For Minikube installation instructions, please see the [official guide](https://github.com/kubernetes/minikube#installation).

You may also want to install a driver to run the Minikube VM. Please follow the
[instructions here](https://minikube.sigs.k8s.io/docs/drivers/)
and note the name of the driver you use. The driver you choose will likely vary depending on your
OS/platform. We recommend [hyperkit](https://minikube.sigs.k8s.io/docs/drivers/hyperkit/)
for macOS and [kvm2](https://minikube.sigs.k8s.io/docs/drivers/kvm2/) on most Linux
distributions.

Once Minikube and the appropriate driver for your OS are installed, you can start Minikube by running:

```sh
minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS
```

### kind

For kind installation instructions, see the [official docs](https://kind.sigs.k8s.io/docs/user/quick-start/).

To use `kind` with Garden you may need to start your cluster with extra port mappings to allow ingress controllers to run (see [their docs](https://kind.sigs.k8s.io/docs/user/ingress/) for more info):

```sh
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF
```

Alternatively, if you don't need an ingress controller, you can set `setupIngressController: null` in your `local-kubernetes` provider configuration and start the cluster without the above customization.

Note that in-cluster building is currently not supported with kind clusters.

