# Table of Contents

* [Welcome!](welcome.md)

## 🌳 Basics

* [How Garden Works](./basics/how-garden-works.md)
* [Quickstart Guide](./basics/quickstart.md)
* [The Stack Graph (Terminology)](./basics/stack-graph.md)

## 🌻 Tutorials

* [Your First Project](./tutorials/your-first-project/README.md)
  * [1. Initialize a Project](./tutorials/your-first-project/1-initialize-a-project.md)
  * [2. Connect to a Cluster](./tutorials/your-first-project/2-connect-to-a-cluster.md)
  * [3. Deploy and Test](./tutorials/your-first-project/3-deploy-and-test.md)
  * [4. Configure Your Project](./tutorials/your-first-project/4-configure-your-project.md)

## 💐 Using Garden

* [Configuration Overview](./using-garden/configuration-overview.md)
* [Projects](./using-garden/projects.md)
* [Modules](./using-garden/modules.md)
* [Services](./using-garden/services.md)
* [Tests](./using-garden/tests.md)
* [Tasks](./using-garden/tasks.md)
* [Workflows](./using-garden/workflows.md)
* [Variables and templating](./using-garden/variables-and-templating.md)
* [Module Templates](./using-garden/module-templates.md)
* [Using the CLI](./using-garden/using-the-cli.md)

## 🌿 Kubernetes Plugins

* [About](./k8s-plugins/about.md)
* [Remote K8s Plugin Configuration](./k8s-plugins/remote-k8s/README.md)
  * [1. Create a Cluster](./k8s-plugins/remote-k8s/create-cluster/README.md)
    * [AWS](./k8s-plugins/remote-k8s/create-cluster/aws.md)
    * [GCP](./k8s-plugins/remote-k8s/create-cluster/gcp.md)
    * [Azure](./k8s-plugins/remote-k8s/create-cluster/azure.md)
  * [2. Configure Container Registry (Optional)](./k8s-plugins/remote-k8s/configure-registry/README.md)
    * [AWS](./k8s-plugins/remote-k8s/configure-registry/aws.md)
    * [GCP](./k8s-plugins/remote-k8s/configure-registry/gcp.md)
    * [Azure](./k8s-plugins/remote-k8s/configure-registry/azure.md)
  * [3. Set Up Ingress, TLS and DNS](./k8s-plugins/remote-k8s/ingress-and-dns.md)
  * [4. Configure the Provider](./k8s-plugins/remote-k8s/configure-provider.md)
* [Local K8s Plugin Configuration](./k8s-plugins/local-k8s/README.md)
  * [1. Install Local Kubernetes](./k8s-plugins/local-k8s/install.md)
  * [2. Configure the Provider](./k8s-plugins/local-k8s/configure-provider.md)
* [Module Configuration](./k8s-plugins/module-types/README.md)
  * [Container](./k8s-plugins/module-types/container.md)
  * [Kubernetes](./k8s-plugins/module-types/kubernetes.md)
  * [Helm](./k8s-plugins/module-types/helm.md)
  * [PersistentVolumeClaim](./k8s-plugins/module-types/persistentvolumeclaim.md)
  * [ConfigMap](./k8s-plugins/module-types/configmap.md)
* [Advanced](./k8s-plugins/advanced/README.md)
  * [In-Cluster Building](./k8s-plugins/advanced/in-cluster-building.md)
  * [Minimal RBAC Configuration for Development Clusters](./k8s-plugins/advanced/rbac-config.md)
  * [Deploying to Production](./k8s-plugins/advanced/deploying-to-production.md)

## 🌺 Terraform Plugin

* [About](./terraform-plugin/about.md)
* [Provider Configuration](./terraform-plugin/configure-provider.md)
* [Module Configuration](./terraform-plugin/configure-modules.md)

## ☘️ Pulumi Plugin

* [About](./pulumi-plugin/about.md)
* [Provider Configuration](./pulumi-plugin/configure-provider.md)
* [Module Configuration](./pulumi-plugin/configure-modules.md)

## 🌹 Other Plugins

* [Container](./other-plugins/container.md)
* [Exec](./other-plugins/exec.md)

## 🌼 Guides

* [Installing Garden](./guides/installation.md)
* [Adopting Garden](./guides/adopting-garden.md)
* [Code Synchronization (Dev Mode)](./guides/code-synchronization-dev-mode.md)
* [Connecting a local service to a K8s cluster (Local Mode)](./guides/running-service-in-local-mode.md)
* [Environments and namespaces](./guides/namespaces.md)
* [Hot Reload](./guides/hot-reload.md)
* [Migrating from Docker Compose to Garden](./guides/migrating-from-docker-compose.md)
* [Using Garden in CI](./guides/using-garden-in-ci.md)

## 🌷 Advanced

* [cert-manager Integration](./advanced/cert-manager-integration.md)
* [Using Remote Sources](./advanced/using-remote-sources.md)
* [Custom Commands](./advanced/custom-commands.md)

## 🪷 Reference

* [Providers](./reference/providers/README.md)
  * [`conftest-container`](./reference/providers/conftest-container.md)
  * [`conftest-kubernetes`](./reference/providers/conftest-kubernetes.md)
  * [`conftest`](./reference/providers/conftest.md)
  * [`container`](./reference/providers/container.md)
  * [`exec`](./reference/providers/exec.md)
  * [`hadolint`](./reference/providers/hadolint.md)
  * [`jib`](./reference/providers/jib.md)
  * [`kubernetes`](./reference/providers/kubernetes.md)
  * [`local-kubernetes`](./reference/providers/local-kubernetes.md)
  * [`maven-container`](./reference/providers/maven-container.md)
  * [`octant`](./reference/providers/octant.md)
  * [`openfaas`](./reference/providers/openfaas.md)
  * [`pulumi`](./reference/providers/pulumi.md)
  * [`terraform`](./reference/providers/terraform.md)
* [Module Types](./reference/module-types/README.md)
  * [`configmap`](./reference/module-types/configmap.md)
  * [`conftest`](./reference/module-types/conftest.md)
  * [`container`](./reference/module-types/container.md)
  * [`exec`](./reference/module-types/exec.md)
  * [`hadolint`](./reference/module-types/hadolint.md)
  * [`helm`](./reference/module-types/helm.md)
  * [`jib-container`](./reference/module-types/jib-container.md)
  * [`kubernetes`](./reference/module-types/kubernetes.md)
  * [`maven-container`](./reference/module-types/maven-container.md)
  * [`openfaas`](./reference/module-types/openfaas.md)
  * [`persistentvolumeclaim`](./reference/module-types/persistentvolumeclaim.md)
  * [`pulumi`](./reference/module-types/pulumi.md)
  * [`templated`](./reference/module-types/templated.md)
  * [`terraform`](./reference/module-types/terraform.md)
* [Template Strings](./reference/template-strings/README.md)
  * [Project configuration context](./reference/template-strings/projects.md)
  * [Environment configuration context](./reference/template-strings/environments.md)
  * [Provider configuration context](./reference/template-strings/providers.md)
  * [Module configuration context](./reference/template-strings/modules.md)
  * [Remote Source configuration context](./reference/template-strings/remote-sources.md)
  * [Project Output configuration context](./reference/template-strings/project-outputs.md)
  * [Custom Command configuration context](./reference/template-strings/custom-commands.md)
  * [Workflow configuration context](./reference/template-strings/workflows.md)
  * [Template Helper Functions](./reference/template-strings/functions.md)
* [Glossary](./reference/glossary.md)
* [Commands](./reference/commands.md)
* [Project Configuration](./reference/project-config.md)
* [Module Template Configuration](./reference/module-template-config.md)
* [Workflow Configuration](./reference/workflow-config.md)

## 🎋 Misc

* [FAQ](./misc/faq.md)
* [Troubleshooting](./misc/troubleshooting.md)
* [Telemetry](./misc/telemetry.md)
