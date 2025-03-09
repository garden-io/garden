---
order: 4
title: New Garden Cloud Version
---

> [!NOTE]
> This is an early draft that we're sharing with our community. We'll also publish a more formal announcements around the launch itself.

On **March 17th** (tentatively), we’re rolling out a brand-new version of **Garden Cloud** on [app.garden.io](http://app.garden.io/)!

This update brings access to our **Managed Container Builder**, which can [dramatically accelerate container builds](https://garden.io/blog/oem-cloud-builder). Until now, this feature has only been available on our Enterprise tier—now, everyone can take advantage of its power and get faster builds.

We’re also introducing the **new Garden Team Tier** which replaces the current single-user dashboard and enables you to easily collaborate with your team while using Garden.

### What to expect

The new Team Tier will look quite a bit different from the current version and come with new capabilities. In the first iteration, we’re specifically focusing on helping teams **spend less time waiting on container builds**.

With the new **"Builds" UI**, you’ll be able to analyze where your container builds are spending the most time. Plus, our **Managed Container Builder** allows your entire team to benefit from **blazing-fast build compute instances**, caching the results of the layers of your Dockerfile on **low-latency, high-throughput NVMe storage**.

One temporary change to note: in this first release, **command results and logs won’t be displayed** as they are in the current version. But don’t worry—we’re working hard to bring them back as soon as possible! We’re a small team, and this approach lets us focus on **improving the most impactful parts of the product first**. We truly appreciate your patience during this transition. 🙂

In general we’re **investing heavily** in the new Garden Cloud product and you can expect to see rapid improvements. As much as we like the current [app.garden.io](http://app.garden.io) version, it has always been a little underdeveloped and we can’t wait to deliver a polished and robust experience with the new one.

To use the new cloud version after the release, you’ll need update to Garden to version 0.14 and sign in again at [app.garden.io](http://app.garden.io). We’ll be adding more docs and content as we get closer to launch.

### Impact

If you’re logged into [app.garden.io](http://app.garden.io) using older versions of the Garden CLI, you’ll see a warning message saying that your command results won’t be available in Garden Cloud. Other than that, Garden will continue to work as expected—the only difference is that logs and command results won’t be visible in the UI.

Again, we’re actively working to **restore this functionality** while making the new Garden Cloud a **vastly better experience overall**.

Stay tuned, and if you have any questions, don’t hesitate to reach out [on Discord](https://discord.com/invite/FrmhuUjFs6) or directly to [eythor@garden.io](mailto:eythor@garden.io) ❤️
