---
order: 4
title: "How Obligate relies on Garden's cloud dev environments"
---

# Case study: How Obligate relies on Garden's cloud dev environments

*April 11, 2023 -- Valerie Slaughter*

> *"I want development to be as close to production as possible and also be able to test any kind of feature in isolation. Garden enables that -- and makes you take for granted something that with another tool set would be really difficult to achieve."*

[Obligate](https://www.obligate.com/) combines deep legal and tech know-how with financial expertise to help build a new blockchain-based financial system. Promoting a fully-regulated approach, Obligate offers a decentralized platform for on-chain financing using bonds and commercial paper on Polygon.

When CTO Daniel Killenberger joined Obligate (then FQX) as lead developer in 2019, he knew they needed a tool to improve developer experience. He didn't want developers to be stuck in limbo waiting on slow pipelines and flaky tests, or frustrated by a painful debugging process.

Daniel was impressed by how Garden brought development and production closer together. "That's why I was so into Garden and the vision of Garden back in the day when we chose it," he told us. He knew it would be a game changer for developer experience -- and he made sure that Obligate was using Garden from the beginning.

His vision has paid off. With Garden, Obligate's engineers develop in production-like environments, run end-to-end tests as they code, and spin up preview environments for QA, expediting the feedback cycle.

We spoke to Daniel about how Garden has improved productivity and developer experience.

## Challenges

> *"Most devs experience a pipeline that will run for God-knows-how-long and the tests simulated have nothing to do with production."*

### Slow, unreliable feedback loops

Developers often struggle to get accurate feedback. "They write feature specifications, write the tests, and then aren't able to launch the software and see what it actually does," Daniel told us.

Often, even when test results come through, they are not reflective of the production environment. "Most devs experience a pipeline that will run for God knows how long and the tests simulated have nothing to do with production. So then if you merge to the master, the pipeline would be different and it would fail."

"I wanted the dev environment to be as close to production and also be able to test any kind of feature in isolation," Daniel said.

### Painful debugging

When it comes to debugging, Daniel told us, it can be difficult to tell what went wrong. Developers live out a detective story as they try to piece together a complete view of what happened.

"It's important to be able to go through all the acceptance criteria for tickets and have the ability to check that in isolation for each feature," Daniel told us.

### Configuration woes

Differences between development, testing, and production environments don't just cause flaky, unreliable tests.

Daniel told us that dealing with configuration drift can potentially be a major pain point when it comes to developer onboarding. "Having a local environment with a team and you have to send over env files or whatever is a huge pain in the ass," he said.

## Solutions

> *"Having a production-like dev environment and then also having those previews for us is incredibly valuable."*

### Production-like dev environments with shareable preview environments

Garden's production-like dev environments eliminate the differences between dev, test, and prod environments. Engineers can run end-to-end tests as they code. This creates faster feedback loops and puts an end to flaky tests.

"Most companies do not have the ability to even spin up a production-like local environment with preview environments," Daniel told us. With Garden, the team has come to take it for granted. "Having a production-like dev environment and then also having those previews for the QA process is incredibly valuable."

QA can spin up a preview environment with a single command (or UI click) at every stage of development.

### (Stack) Stream-lined debugging

Garden's Stack Streams provides a unified view of logs, traces, and events across your entire stack -- every build, task, test, and service to make it easy to fix issues. Working with Stack Streams, Daniel and his team were also able to expedite debugging and reduce frustration.

"Having all the logs in the window makes it very easy to follow the stream of data. As we have logs everywhere, we're able to just put it into perspective at what time which logs showed up," Daniel said. "It made debugging a lot easier."

### Unified config

Bonus: Using Garden has removed the hassle of exporting variables. "I've worked with Garden so much that I kind of forget how much of a hassle it is to send around variables," Daniel said.

He describes Garden Secrets as a game changer. "It just makes it convenient. You can give access and not leak any kind of secrets that may be sensitive and all that makes it very nice."

## Outcomes

> *"I'm still really bought into the vision that Garden has for what developer experience should be and how close developer environments should be to production environments."*

### Faster onboarding for new engineers

The ability to spin up production-like environments that are connected to remote services helps new engineers get up and running right away.

"It only takes us a couple of hours to basically have them set up with a GitHub account and a Garden account," Daniel told us. "Then you can immediately deploy your dev environments and have a couple of microservices all at once."

### High quality ships

With Garden's preview environments, Obligate has been able to improve its overall workflow, allowing engineers to test code as they write it and see results in real time.

This shift in the DevOps process has greatly increased the quality of Obligate's builds, while cutting the time spent on those builds significantly. Preview environments help to keep QA in the loop for feature and release testing.

### Better DevEx

Engineers spend less time waiting for CI, less time trying to smooth friction between environments, and less time fighting to debug. They spend more time in flow, more time efficiently making fixes, and more time shipping cool new features.

As part of its most recent launch, the Obligate platform recorded its first bond issuance. The issuance, which was conducted entirely on-chain without any banks involved, is seen as a major step forward in the mainstream adoption of blockchain-based borrowing and lending infrastructure. Going forward, Obligate will continue to bridge the worlds of DeFi and TradFi and increase access to financing on a global scale.

Garden has helped Obligate grow by providing a platform that allows them to take a good developer experience for granted.

"I'm still really bought into the vision that Garden has for what developer experience should be and how close developer environments should be to production environments," Daniel said. "And nowadays it fulfills that promise quite nicely and that's why we keep using it. It is totally worth it."
