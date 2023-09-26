# Go 🌸

{% hint style="info" %}
If you encounter any issues or bugs 🐛 in this seed, don't hesitate to join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

Go projects and compiled languages can run seamlessly on Garden, with fast image rebuilds as you type, cached tests and more deployed to any number of local and remote Kubernetes environments 🍃.

This seed deploys a simple Go API using Helm and Garden to template our application and seamlessly deploy it to a local Kubernetes cluster ✅.

In 5 minutes ⌛ you will deploy your own Go code into a Kubernetes cluster with a rebuild-free container using Garden's code synchronization.

## Diagram 🖼️

This demo scaffolds a Helm chart we'll deploy to our Kubernetes cluster.

![Quick diagram with tooling](https://ce-content.s3.fr-par.scw.cloud/golang-garden-recipe.png)

## Prerequisites

1. Install Garden CLI and get a Kubernetes cluster running locally by following our [quickstart guide](../../getting-started/quickstart.md) 🔎.
2. Ensure Python is available on your system and version 3.7 or higher by running `python --version`. MacOS and most Linux distributions will have Python already installed. Follow the official Python installation [guide](https://docs.python-guide.org/starting/installation/#installation-guides) if not. Python is required to scaffold the language seed.
3. If  any of the terminology is unfamiliar, don't hesitate to contact our Community Engineering team over on [Discord](https://go.garden.io/discord) 💭.

## TLDR

Get your seed running in less than five minutes by running the following commands:

{% tabs %}
{% tab title="macOS" %}

````bash
brew install garden-io/garden/garden-cli
brew install cookiecutter
cookiecutter https://github.com/garden-io/go-seed.git
cookiecutter https://github.com/garden-io/go-seed.git # Answers the prompts to get your brand new repository
cd ${your-project-name}
garden deploy --sync
````

`garden deploy --sync` will take you to a REPL (Read, Eval, Print, Loop) interactive terminal where you can also run different commands like `test unit` which will run the `unit test` built for this HTTP API.

If you want to get your test results with greater detail, use `get test-results unit.`

{% endtab %}

{% tab title="Linux" %}

```sh
curl -sL https://get.garden.io/install.sh | bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath # Reload your terminal after this step.
pipx install cookiecutter
cookiecutter https://github.com/garden-io/go-seed.git # Answers the prompts to get your brand new repository
cd ${your-project-name}
garden deploy --sync
```

`garden deploy --sync` will take you to a REPL (Read, Eval, Print, Loop) interactive terminal where you can also run different commands like `test unit` which will run the `unit test` built for this HTTP API.

If you want to get your test results with greater detail, use `get test-results unit.`

{% endtab %}

{% endtabs %}

If you would like to dive into the code used for this Garden Seed, check out our [go-seed repository](https://github.com/garden-io/go-seed/blob/main/README.md)

## Conclusion 🔚

Congratulations 🎉 you have reached the end of this Garden seed.

Because this project has Code Synchronization already configured, you can simply modify your `main.go` and observe changes live on the synced code path.

![Test video](https://ce-content.s3.fr-par.scw.cloud/garden-go-seed.gif)

## Next Steps ⏭️

Continue your Garden Journey. If you wish to learn more about Garden, here are a couple of resources you might find interesting:

- Join our beautiful community on [Discord](https://go.garden.io/discord) 👋🏻.
- Give us a star in our [main repository](https://github.com/garden-io/garden) to show your support 💚.
- Read the [How Garden Works](../../overview/how-garden-works.md) page to understand the core concepts behind Garden.
- Read the [Helm Action configuration](../../reference/action-types/Deploy/helm.md) document to extend your Helm configuration within your new project.
- Extend your configuration by using a [Remote K8s environment](../../k8s-plugins/remote-k8s/README.md).

## Contribute ➕

- Join our community on [Discord](https://go.garden.io/discord) 🎉
- If you find any bugs 🐛 or have suggestions to improve our seeds, please don't hesitate to reach out by creating an [issue here](https://github.com/garden-io/garden/issues/new?assignees=&labels=&projects=&template=BUG_REPORT.md&title=) or by asking in our [Discord community](https://go.garden.io/discord)🌸
- To vote on your favorite language/tool in our next Garden seed, create a Feature Request by clicking this [link](https://github.com/garden-io/garden/issues/new?assignees=&labels=feature+request&projects=&template=FEATURE_REQUEST.md&title=%5BFEATURE%5D%3A+).
