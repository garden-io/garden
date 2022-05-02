# Table of Contents

## 🌳 Basics

* [How Garden Works](./basics/how-garden-works.md)
* [The Stack Graph (Terminology)](./basics/stack-graph.md)

## 🌻 Getting Started

* [0. Introduction](./getting-started/0-introduction.md)
* [1. Installation](./getting-started/1-installation.md)
* [2. Initialize a Project](./getting-started/2-initialize-a-project.md)
* [3. Connect to a Cluster](./getting-started/3-connect-to-a-cluster.md)
* [4. Deploy and Test](./getting-started/4-deploy-and-test.md)
* [5. Configure Your Project](./getting-started/5-configure-your-project.md)

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

## 🌿 Guides

* [Cloud Provider Set-up](./guides/cloud-provider-setup.md)
* [Code Synchronization (Dev Mode)](./guides/code-synchronization-dev-mode.md)
* [Connecting a local service to a k8s cluster (Local Mode)](./guides/running-service-in-local-mode.md)
* [Container Modules](./guides/container-modules.md)
* [Environments and namespaces](./guides/namespaces.md)
* [Helm Charts](./guides/using-helm-charts.md)
* [Hot Reload](./guides/hot-reload.md)
* [In-Cluster Building](./guides/in-cluster-building.md)
* [Local Kubernetes](./guides/local-kubernetes.md)
* [Remote Kubernetes](./guides/remote-kubernetes.md)
* [Using Garden in CI](./guides/using-garden-in-ci.md)

## 🌺 Advanced

* [cert-manager Integration](./advanced/cert-manager-integration.md)
* [Terraform](./advanced/terraform.md)
* [Using Remote Sources](./advanced/using-remote-sources.md)
* [Minimal RBAC Configuration for Development Clusters](./advanced/rbac-config.md)
* [Custom Commands](./advanced/custom-commands.md)
* [Pulumi](./advanced/pulumi.md)

## ☘️ Reference

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

## 🌹 Misc

* [FAQ](./misc/faq.md)
* [Troubleshooting](./misc/troubleshooting.md)
* [Telemetry](./misc/telemetry.md)
