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

If you are working in a team and need to use an external registry, you can [configure Garden with an external image registry](https://docs.garden.io/kubernetes-plugins/remote-k8s/configure-registry) such as ECR. Alternatively, you can enable Minikube's `registry-creds` addon, by following these steps:

1.  Make sure Minikube is running by typing `minikube start`

2.  Then run minikube `addons configure registry-creds`

3.  Select applicable container registry 

4.  Enter credentials

5.  Make sure you run minikube `addons enable registry-creds`

Minikube should now be able to authenticate with your chosen cloud provider.

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

### k3s

Use this command to install k3s so it is compatible with Garden. This command tells k3s to use the docker, disables the traefik ingress controller, takes care to make the kubeconfig user-accessible and sets the kubernetes context as the current one via the `KUBECONFIG` variable.

```
curl -sfL https://get.k3s.io | sh -s - --docker --disable=traefik --write-kubeconfig-mode=644
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### Rancher Desktop

Follow the [official instructions](https://docs.rancherdesktop.io/getting-started/installation/) to install Rancher Desktop for your OS.
Once installed open "Preferences" in the Rancher Desktop UI. In the "Container Engine" section choose dockerd and in the "Kubernetes" section untick the box that says "Enable Traefik".

### k3d

[k3d](https://k3d.io) is a lightweight wrapper to run k3s in containers. Its image registry also runs as a container. To expose it to Garden, you need to map the registry port to the host. The following commands will create a k3d cluster with the name k3d-k3s-default and with the registry exposed on port 12345.

```shell
k3d registry create myregistry.localhost --port 12345

k3d cluster create \
  --agents 1 \
  --k3s-arg "--disable=traefik@server:0" \
  --registry-use k3d-myregistry.localhost:12345 \
  --wait
```

In your `project.garden.yml` file, add the following configuration under your `local-kubernetes` provider` block:

```yaml
    context: k3d-k3s-default
    deploymentRegistry:
      hostname: k3d-myregistry.localhost
      port: 12345
      insecure: true
      namespace: ${kebabCase(local.username)}
```

### A note on networking for k3s, k3d and Rancher Desktop

K3s uses the [service load balancer](https://docs.k3s.io/networking#service-load-balancer) to create a daemonset with a `nodePort` for each service of type `LoadBalancer`. Garden installs a NGINX ingress controller by default. ServiceLB will create the `nodePort` on the ports 80 and 443 as specified by the ingress controller. This `nodePort` is in most cases in the VM running rancher-desktop, K3s or K3ds. Therefore there are two options to make that endpoint reachable.

1. Get the IP of the VM and add an entry to your computer's `/etc/hosts` file for your ingress domain:

```
$ kubectl get svc garden-nginx-ingress-nginx-controller -n garden-system -o=jsonpath='{.status.loadBalancer.ingress[0].ip}'
198.19.249.189
$ echo "198.19.249.189 vote.local.demo.garden" >> /etc/hosts
```

2. Port-forward nginx so you can access your ingresses on localhost:

```
$ kubectl port-forward --namespace=garden-system service/garden-nginx-ingress-nginx-controller 8080:80
$ echo "127.0.0.1 vote.local.demo.garden" >> /etc/hosts
```

See also [setup NGINX Ingress Controller](https://docs.rancherdesktop.io/how-to-guides/setup-NGINX-Ingress-Controller/) for more information.

If you want to use the traefik ingress controller shipped with K3s distros make sure to remove the parts from the installation instructions where we disable traefik. In your Garden project configuration set `setupIngressController: false` set in your Garden project file. You will also need to apply one of the two methods described above, supplying traefik's service in approach two.