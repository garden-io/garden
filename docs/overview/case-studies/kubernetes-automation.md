---
order: 3
title: "Case Study: How OEM Used Garden to Empower Developers on Kubernetes"
---

# Case Study: How OEM Used Garden to Empower Developers on Kubernetes

*July 31, 2023 -- Valerie Slaughter and Lisa Lozeau*

Going cloud native can be a headache. Developer Dan Taylor knew that if he was going to move Open Energy Market onto Kubernetes, he would need smart abstraction and automations to preserve developer productivity -- and experience -- in the face of a more complicated tool chain.

"The most important thing we have is the developers. If they're burnt out and struggling, and day to day is difficult, it's not sustainable. You won't ship very often," Taylor said.

With Garden, developers didn't have to become Kubernetes experts: they could get a running system with a single command, while Garden handled the Kubernetes configuration behind the scenes. Adopting Garden not only improved the inner development loop, it also set the stage for OEM to scale their architecture and complexity without pain.

## Challenges: Kubernetes automations

> I realized the question wasn't, 'Can we use Kubernetes?' -- it was, 'Can we automate processes?'

### Migrating from .NET to K8s

[Open Energy Market](https://www.openenergymarket.com/) provides smart energy services that help companies across procurement, carbon reduction, and compliance.

As a .NET Windows house, OEM's team used Visual Studio almost exclusively. Going cloud native would bring a lot of benefits -- increased flexibility and resiliency -- but would also potentially lead to developers having to interface with many different tools, each with their own configurations and variables.

Preserving developer sanity and autonomy was top priority for Taylor. He wanted a dev tooling solution that would abstract away some of the complexity of K8s so devs could concentrate on their work.

### Slow builds and lack of visibility

"Our old system was horrendous," Taylor said. "Historically our builds were incredibly slow. We'd have 30- to 40-minute build times."

Taylor used to monitor GitHub all day, looking for builds that were broken or slow. He wanted to be able to identify roadblocks for the developer team more proactively with data on build times and the stack. This tedious task didn't always yield results.

## Solutions: Kubernetes without the complexity

> Developers just use Garden environments and get moving, which makes them a lot more productive.

### One config that runs everywhere

With Garden, Taylor was able to provide developers with just enough abstraction and automation to make the complexities of Kubernetes easier to manage. Garden allowed OEM to codify all their services and dependencies into the Stack Graph -- an executable blueprint for going from zero to a running system in a single command.

The Stack Graph can be deployed in every stage of development (dev, prod, QA) and works the same in every environment, eliminating configuration drift.

"The fact that the CI/CD pipeline runs the same on my machine, your machine, the cloud was a big draw," Taylor told us.

### Environments with baked-in services and dependencies

Developers can spin up production-like ephemeral environments with all dependencies and services baked in.

Rather than tangling with the complexities of Kubernetes, developers just spin up Garden environments and start coding. "It's in their stack" Taylor told us. "They don't have to reconfigure it. They don't have to figure stuff out. It makes them a lot more productive."

This doesn't just improve developer experience. It also makes onboarding new developers a breeze.

### Smart build and test caching

Garden's build and test caching means that only changed code is retested or rebuilt. Remember builds taking 30-40 minutes each? Neither does Taylor.

"Now, about 90% of builds take five minutes, which is brilliant," he told us. Faster builds keep developers moving instead of being stuck waiting.

### DevOps insights

Garden's DevOps Insights feature gives Taylor visibility into all builds, tests, and deploys executed by Garden. He can easily see the average time for a PR to build, what changes trigger longer build times, and signs that a developer is having a problem.

"It's not about seeing the output of each developer; it's about seeing that each developer is outputting something," Taylor explained. "Sometimes I know when developers are having problems before they do, because I'll see the failure rate increasing."

## Outcomes: Ship faster

> We've made Garden the first tool that a developer uses, because we want them to ship on their first day.

### 83% faster build times

OEM uses Garden's smart caching to reduce build times from 30-40 minutes to just 5 minutes. That's *83% faster*. With faster build times, OEM's team of nine people averages 40 to 50 builds a day.

"We operate on the 'integrate little and often' philosophy: continuous delivery," Taylor told us. "We're using Garden's blue-green deployment process for everything, and we're deploying six times a day."

### 500% faster developer onboarding

With Garden, Taylor told us, "We've taken what was a fourteen-day developer onboarding process down to about half a day."

Garden's dependency- and service-aware Stack Graph takes the manual labor out of getting up and running. "To install all the prerequisites on your laptop, you install Garden, you run a command, and it installs everything for you," said Taylor. "We've made Garden the first tool that a developer uses, because we want them to ship on their first day."

### Test automation

It's also easy to add new tools and services with Garden. OEM invested in test automation suites that run through Garden using [Playwright](https://playwright.dev/). They built the demo in only eight hours. "Without Garden, we would not know how to orchestrate those things," Taylor said.

The team was able to focus on Playwright, build a Docker container, and let Garden take care of the rest. "Garden accesses all the variables. It knows what's deployed in what environment. It just feels wonderful to work with. That's what we were looking for, that feeling of ease."

### Built-in scalability

Garden enables OEM to scale without adding complexity for the developers. It is pluggable, allowing a stack to grow without retooling or disrupting developers. This has made it easier for OEM to build a microservices architecture that supports both British and European versions of some services.

"If you're developing portfolio and you don't care about the net zero, or the calculations or the finance system, you don't need to interact with those parts of the system," Taylor said. Garden keeps track of services and dependencies so developers don't need to think about them at all.

"It makes sure that we can support growth," Taylor said.
