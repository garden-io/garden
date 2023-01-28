# Voting example project

An example application, that showcases a variety of Garden features, such as service dependencies, tasks, running
databases, dev mode, and ingress configuration.

The app is a simple voting application, where you can vote for either cats or dogs.
You can vote as many times as you would like, and observe the results live in the `result` service.

## Usage

Start by running `garden deploy` in the project's top-level directory, to spin the stack up.

```sh
garden deploy
```

**Note:** If you're running _minikube_, you may need to add the appropriate entries to your `/etc/hosts` file.
Find the IP for your local cluster by running `minikube ip` and add an entry with that IP for each of
`vote.vote.local.app.garden`, `result.vote.local.app.garden` and `api.vote.local.app.garden`.
This is not necessary when using Docker for Desktop, because your cluster will then be exposed directly on _localhost_.

### To Vote

The voting UI is at http://vote.vote.local.app.garden/. Open a browser tab, and try voting a few times.

### View Results

In a separate tab, open http://result.vote.local.app.garden. The results there will reflect in real-time your voting.

### Try out code synchronization

To start up the synchronization:

```sh
garden dev
# OR garden deploy --dev=vote
```

Then try making a change to one of the source files in the `vote` service, to see it synchronize into the
running container, instead of the normal build+deploy flow. Note that changing the file will _also_ trigger a
build and some tests, but the code sync should complete almost instantly while those take longer to complete.

### Try out Workflows

This example includes a usage example for Garden workflows. The `workflows.garden.yml` file contains the configuration for a sample workflow called `full-test` which initializes the `db`, runs the tests and cleans up the database afterwards. An example of how to execute custom scripts is also included.

To run the workflow:

```sh
garden run-workflow full-test
```

For more complex use-cases and additional configuration options please refer to the [docs](https://docs.garden.io/using-garden/workflows).
