---
title: Installing Local Kubernetes
order: 5
---

## Docker Desktop

[Docker Desktop](https://docs.docker.com/engine) is our recommended option for local Kubernetes on Mac and Windows.

Please refer to their [installation guide](https://docs.docker.com/engine/installation/) for how to download and install it (which is a pretty simple process).

_Note: If you have an older version installed, you may need to update it in order to enable Kubernetes support._

Once installed, open Docker Desktop's preferences, go to the Kubernetes section, tick `Enable Kubernetes` and save.

## MicroK8s

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

## minikube

minikube is a tool that makes it easy to run Kubernetes locally for local development. Garden supports running minikube on macOS, Linux, and Windows via the Windows Subsystem for Linux.

If you wish to use minikube with Garden's image building capabilities, be sure to configure Garden appropriately before running `garden deploy` or `garden build`. See the following sections for more information.

### Expose minikube's Docker daemon for local image building

minikube runs its own Docker daemon. Practically speaking, this has the effect of isolating images from `garden` when using `garden deploy` or `garden build`. If you receive an error like `Error deploying deploy.backend2: ImagePullBackOff - Back-off pulling image "backend2:v-aa19766a21"`, you'll need to expose minikube's Docker daemon, run the following command:

{% tabs %}
{% tab title="macOS" %}

```sh
eval $(minikube docker-env)
```

{% endtab %}

{% tab title="Linux" %}

```sh
eval $(minikube docker-env)
```

{% endtab %}

{% tab title="Windows" %}

```powershell
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
```

{% endtab %}

{% endtabs %}

If you're using an external image registry, see the following section.

### minikube and external registries

If you are working in a team and need to use an external registry, you can [configure Garden with an external image registry](https://docs.garden.io/kubernetes-plugins/remote-k8s/configure-registry) such as ECR. Alternatively, you can enable minikube's `registry-creds` addon, by following these steps:

1.Make sure minikube is running by typing `minikube start`

2.Then run minikube `addons configure registry-creds`

3.Select applicable container registry

4.Enter credentials

5.Make sure you run minikube `addons enable registry-creds`

minikube should now be able to authenticate with your chosen cloud provider.

## kind

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

## k3s

Use this command to install k3s so it is compatible with Garden. This command configures k3s to use docker as the container runtime and disables the traefik ingress controller. It also makes the kubeconfig user-accessible and sets the kubernetes context as the current one via the `KUBECONFIG` variable.

```bash
curl -sfL https://get.k3s.io | sh -s - --docker --disable=traefik --write-kubeconfig-mode=644
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

## Rancher Desktop

Follow the [official instructions](https://docs.rancherdesktop.io/getting-started/installation/) to install Rancher Desktop for your OS.
Once installed open "Preferences" in the Rancher Desktop UI. In the "Container Engine" section choose dockerd and in the "Kubernetes" section untick the box that says "Enable Traefik".

{% hint style="warning" %}
If, on deploy, you encounter `error: Internal error occurred: error executing command in container: http: invalid Host header`, please downgrade your Kubernetes version to v1.27.2. This is an [upstream bug in Moby](https://github.com/moby/moby/issues/45935).
{% endhint %}

![Preferences in Rancher Desktop to downgrade Kubernetes version](https://github.com/garden-io/garden/assets/59834693/aaa3f477-ed6f-430a-85f8-f880a96c4f2a)

## k3d

[K3d](https://k3d.io) is a lightweight wrapper to run k3s in containers. Its image registry also runs as a container. To expose it to Garden, you need to map the registry port to the host. The following commands will create a k3d cluster with the name k3d-k3s-default and with the registry exposed on port 12345.

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

## OrbStack

[OrbStack's native Kubernetes offering](https://docs.orbstack.dev/kubernetes/) works seamlessly with Garden. Follow OrbStack's official instructions [to spin up its native Kubernetes cluster](https://docs.orbstack.dev/kubernetes/).

## A note on networking for k3s, k3d and Rancher Desktop

K3s and its derivatives use the [Service Load Balancer](https://docs.k3s.io/networking#service-load-balancer) (ServiceLB) as a LoadBalancer controller. ServiceLB is ingress controller agnostic. By default, Garden installs an NGINX ingress controller to expose domains on common ports.

On macOS and Windows, Rancher Desktop creates a bridged network to serve local domain URLs. This means that you can access your local domains on the host machine. Note that you need to [allow administrative access](https://docs.rancherdesktop.io/ui/preferences/application/general/#administrative-access) for rancher-desktop in order for this to work.

For users of k3d on macOS or Linux you'll need to do some extra configuration to expose your local domains.

You can direct your ingress domain to the IP of the VM by adding an entry to the `/etc/hosts` file on your computer. Use the following command:

```bash
echo "$(kubectl get node/lima-rancher-desktop -o json | jq -r '.status.addresses[] | select(.type=="InternalIP").address') vote.local.demo.garden" | sudo tee -a /etc/hosts
```

Replace `vote.local.demo.garden` with the domain you want to use.

For users of Rancher Desktop users _on Linux_ you'll need to port forward the NGINX ingress controller to access your local domains. Use the following command:

```bash
kubectl port-forward --namespace=garden-system service/garden-nginx-ingress-nginx-controller 8080:80
```

Then you can access your local domains on port 8080. For example, `http://vote.local.demo.garden:8080`.

See also Rancher Desktop's [Setup NGINX Ingress Controller](https://docs.rancherdesktop.io/how-to-guides/setup-NGINX-Ingress-Controller/) for more information.

### Using an alternative ingress controller

If you prefer to use the Traefik ingress controller included with k3s distributions, you must modify the installation instructions for [Rancher Desktop](#rancher-desktop) and [k3d](#k3d) by removing any parts where Traefik is disabled. In your Garden project configuration file, set `setupIngressController: false`. Additionally, apply one of the two methods described above, specifying Traefik's service in the second approach.

## Updating or removing the Garden installed Nginx ingress controller

Garden will not automatically try to update the nginx ingress controller. To update it you must remove it first and then run a Garden command against that cluster again. Garden will then deploy the version of the ingress controller shipped with that specific Garden version. If you want to remove it alltogether, set `setupIngressController: false` in your Garden project's provider configuration.
To remove the ingress controller run this command:

```
garden plugins kubernetes uninstall-garden-services
```

## Moving between Rancher Desktop and Docker Desktop

If you wish to move from Rancher Desktop to Docker Desktop, or vice versa, you will need to follow a few steps:

1. Uninstall either Rancher Desktop or Docker Desktop.
2. Delete or back up your `~/.kube` directory. This is especially important for Windows users because Docker Desktop treats the `~/.kube` directory as a symlink.
3. Delete or back up your `~/.docker` directory. Docker Desktop sets entries in the `~/.docker/config.json` file that expect Docker Desktop to be running. If you don't delete this file, you will get errors when you try to run `docker` build commands.
