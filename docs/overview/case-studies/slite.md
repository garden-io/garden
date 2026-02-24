---
order: 5
title: "Case Study: Slite - \"Garden is the best companion for a Kubernetes dev, from local envs to CD.\""
---

# Case Study: "Garden is the best companion for a Kubernetes dev, from local envs to CD."

*June 8, 2021 — Mike Winters*

## How Slite uses Garden for more developer autonomy, better pre-release testing, and fewer production issues.

*Key Takeaways*

- Slite uses Garden to give every developer their own on-demand environment for pre-release testing, eliminating a major staging bottleneck that was hurting productivity
- QA teams, developers, and designers can now use shared environments during the pre-release review process, resulting in a better product with fewer issues in production
- Garden enabled Slite to move beyond Docker Compose and into the cloud when the application became too large to build and deploy on a laptop

## "Hey, can I have staging?"

It was a phrase that showed up so often in the company chat that it'd become a running joke amongst the engineering team. [Slite](https://slite.com/), a communication tool for remote teams, was growing quickly, and **that growth exposed bottlenecks in the development process**.

"We had just one production-like staging environment where engineers could test their changes before pushing," says Arnaud Rinquin, a senior developer at Slite. "And so we'd have to queue to wait our turn to use it. As the team grew, this waiting became unbearable."

## Developer independence via on-demand environments

The staging bottleneck was having a major impact on developer productivity, plus developers were rushing their pre-release testing so they could free up the shared environment as quickly as possible for the next person in line. Something had to change.

That's where Garden came in. Now, every developer at Slite can spin up their own production-like environment for testing whenever they need it.

"There's a lot less frustration on the dev team now because there are **far fewer bottlenecks**," Arnaud adds. "Our **developers are independent** and can work without constantly bumping into each other. They're autonomous, *and* they're **more confident about what they ship**, because they've tested thoroughly in a production-like setting."

## Better QA and design reviews for a better product

Garden has also enabled Slite to run a better QA and design review process before releasing to production.

"Having a shareable, production-like environment for pre-release user testing and design review has **increased the quality of our releases**. We used to realize *after* shipping that a feature wasn't optimal, but we're able to catch those issues beforehand now. With Garden, a developer and designer can sit together and share a **proper, real-life environment** during the review process."

## Beyond Docker Compose to smart in-cluster builds

Along with a revamp of their testing and QA processes thanks to ephemeral environments, what *first* brought Slite to Garden was a need to replace Docker Compose for local development.

"We had **too many services for Docker Compose to handle**, and the workload was too much for a single laptop. It was painful. We decided it was time to look for something so that **our developers could work in the cloud.** Garden's shared cache for building images—and all the time we'd save as a result—was the initial selling point for using Garden."

Slite's developers can now work on their service locally while running the rest of the stack in a Garden-powered environment in the cloud—a much more manageable workload for a laptop.

## Up next? Automated end-to-end testing with every pull request.

Slite currently uses Garden Enterprise to manage secrets across developers and environments. They next plan to take steps toward continuous deployment with Garden, taking advantage of triggered workflows to spin up an environment and run automated end-to-end and integration tests with every PR.

"The guidance we get from the Garden team is awesome and has been a huge value to us. **Garden is very responsive, but also very human and friendly.** It's not a stiff enterprise relationship that gives you the feeling you have to be wearing a suit to talk to them."

"The team provided fast support for everything from niche topics like generating wildcard TLS certificates, to fixing inefficiencies in our own Dockerfiles, and also providing workarounds for processes that aren't yet in Garden or are still experimental features."

What advice would Arnaud give to other users who are looking at Garden?

"If you use Kubernetes, at some point you'll need to upgrade your development tooling. Garden is the simplest solution that will cover all of your use cases from dev environments to continuous deployment. **Garden eliminates a lot of the complexity** and limits the choices you have to make by being an off-the-shelf, single solution—it has a wide scope. **It's the best companion for a Kubernetes developer, from local environments to CD, all in one tool.**"
