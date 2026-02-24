---
order: 2
title: "Case Study: How Podium End-to-End Tests Hundreds of Services a Day"
---

# How Podium End-to-End Tests Hundreds of Services a Day

*October 3, 2023 — Valerie Slaughter*

> We now deploy and end-to-end test 130 services, hundreds of times per day. We could not have done that without Garden.
>
> — Drew Bowman, Sr. Software Engineering Manager at Podium

[Podium](https://www.podium.com/) provides local businesses with easy-to-use growth, communication, and payment tools.

Before they started using Garden in 2021, Podium's development team was only running a handful of end-to-end tests, and only against the production environment. Without a standard way of running services in CI, they weren't able to run end-to-end tests pre-merge.

Podium used Garden's dependency graph, called the Stack Graph, to standardize build and deployment processes so that the team could spin up the same production-like environments in CI as they could in development. This, along with Garden's smart test and build caching, helped Podium to run tests earlier and more often -- and much faster.

"We now deploy and end-to-end test 130 services, hundreds of times per day," Drew Bowman, Sr. Software Engineering Manager at Podium told us. "We could not have done that without Garden."

We talked to Bowman as well as Andrew Jensen, Sr. Software Engineer at Podium, about how they're empowering developers and streamlining testing.

## Problems: Lots of complexity, no way to manage it

> There were just too many services.

### Testing against production

When it came to running end-to-end tests, Podium's development team had no standard way of running services in CI, and so were left end-to-end testing against the production environment.

It was an inelegant system, Jensen told us. The QA team would be alerted by production test failures. But because tests didn't run on merge requests, it was easy for them to go out of sync with app code, which led to a high rate of false positive alerts -- and a tired QA team.

Podium needed to be able to run pre-production tests and in order to do that, first they would need a standard way to run their services.

### Laptops on fire

Podium's team relied heavily on local development. To work on a particular service, they would run it locally by cloning a repo called "platform" -- essentially a very large Docker Compose configuration file with a handful of shell scripts in subdirectories.

But Jensen knew it was untenable. "There were just too many services," he said. It was overloading their development laptops. "It would cause big time RAM issues and CPU issues, and even disk issues with creating tons of Docker images locally."

Podium needed a solution that would allow the team to work on individual services without their laptops burning up.

### Manual deployments

Before using Garden, Bowman said, there was no source of truth.

"We had created different sets of Docker compose files, scattered throughout different places, and they were never up to date," Bowman said. Simple processes were taking developers too much time.

Standardizing workflows and, ideally, automating them would mean huge time savings.

## Solutions: An executable dependency graph

> Defining things using Garden's framework has helped us to develop in a streamlined way.

### One source of truth

Garden's Stack Graph was the biggest game-changer for Podium. The Stack Graph created a blueprint of their system's services and dependencies, standardizing and automating the deployment process.

"When you automate something, you make it canonical," Jensen told us. "Defining things using Garden's framework has helped us to develop in a streamlined way."

Every time a team member builds, deploys, or tests, it's guaranteed to be the same.

### Production-like ephemeral environments for dev and CI

The Stack Graph allows developers to instantly spin up service- and dependency-aware environments with a single command.

"It makes it really easy for developers to just get going," Bowman said. "Developers don't have to be concerned with what their service does, as long as it fits in the framework. Garden guarantees it will start up, play nice with others, and work in dev and CI."

This empowers developers to run end-to-end tests much earlier -- and to trust that those tests will work the same in development, CI, and production.

### Build and test caching

Garden speeds up testing pipelines by selectively retesting and rebuilding only the parts of your stack that have changed. For remote environments, the test results are stored at the cluster level so that the entire team can share the cached results.

Garden's caching capabilities made it much faster for Podium to run tests.

### Hybrid development

With Garden, devs don't need to worry about installing, configuring, and running resource-intensive tools. Garden's environments run in remote Kubernetes clusters but have fast feedback loops that feel local.

"Moving to hybrid development with Garden made it so our laptops were not overheating and burning up," Jensen told us. "And we were able to become more productive as a result."

## Outcomes: From chaos to order

> Garden is cool and we like it.

### More reliable shipping with powerful CI automation

Garden, Jensen said, "effectively let us move from **testing in production** to **testing in CI, monitoring in production**."

With the Stack Graph, they were able to standardize the process to spin up an environment in CI, just like in dev.

Now, they use ephemeral environments to run end-to-end tests with Cypress against their core frontend repo, as well as most backend repos, on merge requests. They only run tests for the product areas being changed.

"We've been investing a lot in CI," Bowman told us. "And specifically CI and Garden environments for running end-to-end tests. And we built something that's really big and really powerful."

### Developer empowerment

"Garden has empowered our developers," Bowman told us. "Empowered them to onboard quickly, to test and run their code in a standard way."

With Garden, devs don't need to worry about installing, configuring, and running resource-intensive tools. That means shorter onboarding times, faster coding, and an icey cool computer.

Garden has "streamlined" Podium's development process, Bowman said, so the dev team could stay busy shipping cool features -- like an [AI assistant](https://www.podium.com/ai-assistant/) that can respond to online reviews, summarize calls, and more -- instead of wrangling internal tooling.

### Scalability: A balance between automation and abstraction

Bowman appreciates that Garden abstracts away some of the complexity of Kubernetes so that developers don't need to be K8s experts.

But, he notes, Garden strikes a balance between abstracting away complexity and providing smart automations to better navigate it. That means that when things go wrong, developers default to troubleshooting with Garden.

But if things stay hairy, developers can still use kubectl commands or the k9s dashboard when they need to. "There's that escape hatch to see what is happening at a lower level," Jensen told us.

"That's where the big scalability productivity gains come from," Bowman said, "having both options."
