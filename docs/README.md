# Table of Contents

* [Welcome to Garden!](welcome.md)

## 🌸 Overview

* [How Garden Works](./overview/how-garden-works.md)
* [Core Concepts](./overview/core-concepts.md)
* [Adopting Garden](./overview/adopting-garden.md)
* [Garden vs Other Tools](./overview/garden-vs-other-tools.md)

## 🌳 Use Cases

* [Isolated On-Demand Preview Environments](./use-cases/on-demand-preview-envs.md)
* [Fast, Portable CI Pipelines that Run Anywhere](./use-cases/portable-ci-pipelines.md)
* [Shift Testing Left](./use-cases/shift-testing-left.md)
* [Local Development With Remote Clusters](./use-cases/local-development-remote-clusters.md)
* [Jumpstart your Internal Developer Platform](./use-cases/jumpstart-idp.md)

## 🌻 Getting Started

* [Quickstart Guide](./getting-started/quickstart.md)
* [Installing Garden](./getting-started/installation.md)
* [Next Steps](./getting-started/next-steps.md)

## 💐 Tutorials

* [Your First Project](./tutorials/your-first-project/README.md)
  * [1. Create a Garden Project](./tutorials/your-first-project/1-initialize-a-project.md)
  * [2. Pick a Kubernetes Plugin](./tutorials/your-first-project/2-connect-to-a-cluster.md)
  * [3. Add Actions](./tutorials/your-first-project/3-add-actions.md)
  * [4. Add Tests](./tutorials/your-first-project/4-testing.md)
  * [5. Code Syncing (Hot Reload)](./tutorials/your-first-project/5-code-syncing.md)
  * [6. Next Steps](./tutorials/your-first-project/6-configure-your-project.md)

## 🌿 Using Garden

* [About](./using-garden/about.md)
* [Configuration Overview](./using-garden/configuration-overview.md)
* [Projects](./using-garden/projects.md)
* [Dashboard](./using-garden/dashboard.md)
* [Actions](./using-garden/actions.md)
* [Tests](./using-garden/tests.md)
* [Runs](./using-garden/runs.md)
* [Workflows](./using-garden/workflows.md)
* [Variables and templating](./using-garden/variables-and-templating.md)
* [Config Templates](./using-garden/config-templates.md)
* [Using the CLI](./using-garden/using-the-cli.md)
* [Modules](./using-garden/modules.md)

## 🌺 Kubernetes Plugins

* [About](./k8s-plugins/about.md)
* [Remote K8s Plugin Configuration](./k8s-plugins/remote-k8s/README.md)
  * [1. Create a Cluster](./k8s-plugins/remote-k8s/create-cluster/README.md)
    * [AWS](./k8s-plugins/remote-k8s/create-cluster/aws.md)
    * [GCP](./k8s-plugins/remote-k8s/create-cluster/gcp.md)
    * [Azure](./k8s-plugins/remote-k8s/create-cluster/azure.md)
  * [2. Configure Container Registry](./k8s-plugins/remote-k8s/configure-registry/README.md)
    * [AWS](./k8s-plugins/remote-k8s/configure-registry/aws.md)
    * [GCP](./k8s-plugins/remote-k8s/configure-registry/gcp.md)
    * [Azure](./k8s-plugins/remote-k8s/configure-registry/azure.md)
  * [3. Set Up Ingress, TLS and DNS](./k8s-plugins/remote-k8s/ingress-and-dns.md)
  * [4. Configure the Provider](./k8s-plugins/remote-k8s/configure-provider.md)
* [Local K8s Plugin Configuration](./k8s-plugins/local-k8s/README.md)
  * [1. Install Local Kubernetes](./k8s-plugins/local-k8s/install.md)
  * [2. Configure the Provider](./k8s-plugins/local-k8s/configure-provider.md)
* [Ephemeral K8s Plugin Configuration](./k8s-plugins/ephemeral-k8s/README.md)
  * [1. Configure the Provider](./k8s-plugins/ephemeral-k8s/configure-provider.md)
  * [2. Login to the Garden dashboard](./k8s-plugins/ephemeral-k8s/login-web-dashboard.md)
  * [3. Configure Ingress (optional)](./k8s-plugins/ephemeral-k8s/ingress.md)
  * [4. Retrieve Kubeconfig (optional)](./k8s-plugins/ephemeral-k8s/retrieve-kubeconfig.md)
* [Actions](./k8s-plugins/actions/README.md)
  * [Build](./k8s-plugins/actions/build/README.md)
    * [Container](./k8s-plugins/actions/build/container.md)
  * [Deploy](./k8s-plugins/actions/deploy/README.md)
    * [Kubernetes](./k8s-plugins/actions/deploy/kubernetes.md)
    * [Helm](./k8s-plugins/actions/deploy/helm.md)
    * [Container](./k8s-plugins/actions/deploy/container.md)
    * [PersistentVolumeClaim](./k8s-plugins/actions/deploy/persistentvolumeclaim.md)
    * [ConfigMap](./k8s-plugins/actions/deploy/configmap.md)
  * [Run and Test](./k8s-plugins/actions/run-test/README.md)
    * [Kubernetes Pod](./k8s-plugins/actions/run-test/kubernetes-pod.md)
    * [Helm Pod](./k8s-plugins/actions/run-test/helm-pod.md)
    * [Kubernetes Exec](./k8s-plugins/actions/run-test/kubernetes-exec.md)
    * [Container](./k8s-plugins/actions/run-test/container.md)
* [Guides](./k8s-plugins/guides/README.md)
  * [In-Cluster Building](./k8s-plugins/guides/in-cluster-building.md)
  * [Minimal RBAC Configuration for Development Clusters](./k8s-plugins/guides/rbac-config.md)
  * [Deploying to Production](./k8s-plugins/guides/deploying-to-production.md)

## ☘️ Terraform Plugin

* [About](./terraform-plugin/about.md)
* [Plugin Configuration](./terraform-plugin/configure-provider.md)
* [Actions](./terraform-plugin/actions.md)

## 🌹 Pulumi Plugin

* [About](./pulumi-plugin/about.md)
* [Plugin Configuration](./pulumi-plugin/configure-provider.md)
* [Actions](./pulumi-plugin/actions.md)

## 🌼 Other Plugins

* [Container](./other-plugins/container.md)
* [Exec (local scripts)](./other-plugins/exec.md)

## 🌷 Guides

* [Migrating to Bonsai](./guides/migrating-to-bonsai.md)
* [Connecting a local application to a Kubernetes cluster (Local Mode)](./guides/running-service-in-local-mode.md)
* [Environments and namespaces](./guides/namespaces.md)
* [Migrating from Docker Compose to Garden](./guides/migrating-from-docker-compose.md)
* [Code Synchronization](./guides/code-synchronization.md)
* [Using Garden in CircleCI](./guides/using-garden-in-circleci.md)

## 🪷 Advanced

* [Using Remote Sources](./advanced/using-remote-sources.md)
* [Custom Commands](./advanced/custom-commands.md)

## 🎋 Reference

* [Providers](./reference/providers/README.md)
  * [`conftest-container`](./reference/providers/conftest-container.md)
  * [`conftest-kubernetes`](./reference/providers/conftest-kubernetes.md)
  * [`conftest`](./reference/providers/conftest.md)
  * [`container`](./reference/providers/container.md)
  * [`ephemeral-kubernetes`](./reference/providers/ephemeral-kubernetes.md)
  * [`exec`](./reference/providers/exec.md)
  * [`hadolint`](./reference/providers/hadolint.md)
  * [`jib`](./reference/providers/jib.md)
  * [`kubernetes`](./reference/providers/kubernetes.md)
  * [`local-kubernetes`](./reference/providers/local-kubernetes.md)
  * [`octant`](./reference/providers/octant.md)
  * [`otel-collector`](./reference/providers/otel-collector.md)
  * [`pulumi`](./reference/providers/pulumi.md)
  * [`terraform`](./reference/providers/terraform.md)
* [Action Types](./reference/action-types/README.md)
  * [Build](./reference/action-types/Build/README.md)
    * [`container` Build](./reference/action-types/Build/container.md)
    * [`exec` Build](./reference/action-types/Build/exec.md)
    * [`jib-container` Build](./reference/action-types/Build/jib-container.md)
  * [Deploy](./reference/action-types/Deploy/README.md)
    * [`configmap` Deploy](./reference/action-types/Deploy/configmap.md)
    * [`container` Deploy](./reference/action-types/Deploy/container.md)
    * [`exec` Deploy](./reference/action-types/Deploy/exec.md)
    * [`helm` Deploy](./reference/action-types/Deploy/helm.md)
    * [`kubernetes` Deploy](./reference/action-types/Deploy/kubernetes.md)
    * [`persistentvolumeclaim` Deploy](./reference/action-types/Deploy/persistentvolumeclaim.md)
    * [`pulumi` Deploy](./reference/action-types/Deploy/pulumi.md)
    * [`terraform` Deploy](./reference/action-types/Deploy/terraform.md)
  * [Run](./reference/action-types/Run/README.md)
    * [`container` Run](./reference/action-types/Run/container.md)
    * [`exec` Run](./reference/action-types/Run/exec.md)
    * [`helm-pod` Run](./reference/action-types/Run/helm-pod.md)
    * [`kubernetes-exec` Run](./reference/action-types/Run/kubernetes-exec.md)
    * [`kubernetes-pod` Run](./reference/action-types/Run/kubernetes-pod.md)
  * [Test](./reference/action-types/Test/README.md)
    * [`conftest-helm` Test](./reference/action-types/Test/conftest-helm.md)
    * [`conftest` Test](./reference/action-types/Test/conftest.md)
    * [`container` Test](./reference/action-types/Test/container.md)
    * [`exec` Test](./reference/action-types/Test/exec.md)
    * [`hadolint` Test](./reference/action-types/Test/hadolint.md)
    * [`helm-pod` Test](./reference/action-types/Test/helm-pod.md)
    * [`kubernetes-exec` Test](./reference/action-types/Test/kubernetes-exec.md)
    * [`kubernetes-pod` Test](./reference/action-types/Test/kubernetes-pod.md)
* [Template Strings](./reference/template-strings/README.md)
  * [Project template context](./reference/template-strings/projects.md)
  * [Environment template context](./reference/template-strings/environments.md)
  * [Provider template context](./reference/template-strings/providers.md)
  * [Action (all fields) template context](./reference/template-strings/action-all-fields.md)
  * [Action spec template context](./reference/template-strings/action-specs.md)
  * [Module template context](./reference/template-strings/modules.md)
  * [Remote Source template context](./reference/template-strings/remote-sources.md)
  * [Project Output template context](./reference/template-strings/project-outputs.md)
  * [Custom Command template context](./reference/template-strings/custom-commands.md)
  * [Workflow template context](./reference/template-strings/workflows.md)
  * [Template Helper Functions](./reference/template-strings/functions.md)
* [Commands](./reference/commands.md)
* [Project Configuration](./reference/project-config.md)
* [ConfigTemplate Reference](./reference/config-template-config.md)
* [RenderTemplate Reference](./reference/render-template-config.md)
* [Workflow Configuration](./reference/workflow-config.md)
* [Garden Containers on Docker Hub](./reference/dockerhub-containers.md)
* [Module Template Configuration](./reference/module-template-config.md)
* [Module Types](./reference/module-types/README.md)
  * [`configmap`](./reference/module-types/configmap.md)
  * [`conftest`](./reference/module-types/conftest.md)
  * [`container`](./reference/module-types/container.md)
  * [`exec`](./reference/module-types/exec.md)
  * [`hadolint`](./reference/module-types/hadolint.md)
  * [`helm`](./reference/module-types/helm.md)
  * [`jib-container`](./reference/module-types/jib-container.md)
  * [`kubernetes`](./reference/module-types/kubernetes.md)
  * [`persistentvolumeclaim`](./reference/module-types/persistentvolumeclaim.md)
  * [`pulumi`](./reference/module-types/pulumi.md)
  * [`templated`](./reference/module-types/templated.md)
  * [`terraform`](./reference/module-types/terraform.md)

## 🌸 Misc

* [FAQ](./misc/faq.md)
* [Troubleshooting](./misc/troubleshooting.md)
* [Telemetry](./misc/telemetry.md)

## 🌳 Contributing to Garden

* [Contributor Covenant Code of Conduct](./contributing/CODE_OF_CONDUCT.md)
* [Contributing to the Docs](./contributing/contributing-docs.md)
* [Setting up your developer environment](./contributing/garden-dev-env-setup.md)
* [Developing Garden](./contributing/developing-garden.md)
* [Config resolution](./contributing/config-resolution.md)
* [Graph execution](./contributing/graph-execution.md)
