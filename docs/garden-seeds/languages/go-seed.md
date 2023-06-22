# Go seed 🌸

{% hint style="info" %}
If you encounter any issues or bugs 🐛 in this seed, don't hesitate to contact our [Discord Community](https://go.garden.io/discord) 🌸.
{% endhint %}

Go projects and compiled languages can run seamlessly on Garden, using our SDLC inner loop with local/remote Kubernetes environments 🍃.

This seed deploys a simple Go API using Helm and Garden to template our application and seamlessly deploy it to a local Kubernetes cluster ✅.

In 5 minutes ⌛ you will deploy your own Go code into a Kubernetes cluster with a rebuild-free container using Garden's code synchronization.

[Seed Repo](https://github.com/garden-io/go-seed)

## Diagram 🖼️

This demo uses Garden with Helm to deploy to our Kubernetes cluster; to do so, we will need to create our Helm Chart first.

![Quick diagram with tooling used in the project](https://ce-content.s3.fr-par.scw.cloud/golang-garden-recipe.png)

## Prerequisites

1. Install Garden CLI and get a Kubernetes cluster running locally by following our [quickstart guide](https://docs.garden.io/basics/quickstart) 🔎.
2. Install Python3; we need this to run/install Cookiecutter 🍪; most distros/OS already include python3, but if you don't, you can install it by following this [guide](https://docs.python-guide.org/starting/installation/#installation-guides).
3. Across this seed, we mention multiple concepts of Kubernetes and Helm, so if you are unfamiliar with any terminology, don't hesitate to contact our Community Engineering team over [Discord](https://go.garden.io/discord) 💭.

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

If you would like to understand how the configuration is working behind the scenes checkout our [go-seed repository](https://github.com/garden-io/go-seed/blob/main/README.md)

## Conclusion 🔚

Congratulations 🎉 you have reached the end of this Garden seed.

Now you can deploy your new API and be proud of your hard work, because this project has `sync` enabled, you can simply modify your `main.go` and watch how your Go code gets rebuilt each time.

![Test video](https://ce-content.s3.fr-par.scw.cloud/garden-go-seed.gif)

## Next Steps ⏭️

Continue your Garden Journey. If you wish to learn more about Garden, here are a couple of resources you might find interesting:

- Join our beautiful Community on [Discord](https://go.garden.io/discord) 👋🏻.
- Give us a star in our [main repository](https://github.com/garden-io/garden) to show your support 💚.
- Read the [How Garden Works](https://docs.garden.io/basics/how-garden-works) page to understand the core concepts behind Garden.
- Read the [Helm Action configuration](https://docs.garden.io/reference/action-types/deploy/helm) document to extend your Helm configuration within your new project.
- Extend your configuration by using a [Remote K8s environment](https://docs.garden.io/kubernetes-plugins/remote-k8s).

## Contribute ➕

- Join our community in [Discord](https://go.garden.io/discord) 🎉
- If you find any bugs 🐛 or have suggestions to improve our seeds, please don't hesitate to reach out by creating an [issue here](https://github.com/garden-io/garden/issues/new?assignees=&labels=&projects=&template=BUG_REPORT.md&title=) or by asking in our [Discord Community](https://go.garden.io/discord)🌸
- If you would like to see your favorite language/tooling in our next Garden seed, create a Feature Request by clicking this [link](https://github.com/garden-io/garden/issues/new?assignees=&labels=feature+request&projects=&template=FEATURE_REQUEST.md&title=%5BFEATURE%5D%3A+).