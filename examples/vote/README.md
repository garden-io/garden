# Voting example project

An example application, that showcases a variety of Garden features, such as service dependencies, tasks, running
databases, hot reloading, and ingress configuration.

The app is a simple voting application, where you can vote for either cats or dogs.
You can vote as many times as you would like, and observe the results live in the `result` service.

## Usage

Start by running `garden deploy` or `garden dev` in the project's top-level directory, to spin the stack up.

```sh
garden dev
Good afternoon! Let's get your environment wired up...

✔ local-kubernetes          → Configured
✔ jworker                   → Building jworker:8bbc389b3e... → Done (took 0.6 sec)
✔ postgres                  → Building → Done (took 0.4 sec)
✔ result                    → Building result:8bbc389b3e... → Done (took 0.5 sec)
✔ vote                      → Building vote:8bbc389b3e-1543837972... → Done (took 0.5 sec)
✔ redis                     → Checking status → Version 8bbc389b3e already deployed
✔ db                        → Checking status → Version 8bbc389b3e already deployed
✔ result                    → Checking status → Version 8bbc389b3e already deployed
```

**Note:** If you're running _minikube_, you may need to add the appropriate entries to your `/etc/hosts` file.
Find the IP for your local cluster by running `minikube ip` and add an entry with that IP for each of
`vote.local.app.garden`, `result.local.app.garden` and `api.local.app.garden`.
This is not necessary when using Docker for Desktop, because your cluster will then be exposed directly on _localhost_.

### To Vote

The voting UI is at http://vote.local.app.garden/. Open a browser tab, and try voting a few times.

### View Results

In a separate tab, open http://result.local.app.garden. The results there will reflect in real-time your voting.

### Try out hot-reloading

Hot-reloading needs to be enabled per service when starting `garden deploy` or `garden dev`:

```sh
garden dev --hot=vote
# OR garden deploy --hot=vote
```

Then try making a change to one of the source files in the `vote` service, to see it synchronize into the
running container, instead of the normal build+deploy flow. Note that changing the file will _also_ trigger a
build and some tests, but the hot-reloading should complete almost instantly while those take longer to complete.
