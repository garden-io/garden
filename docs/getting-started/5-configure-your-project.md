# 5. Configure Your Project

With the basic example all set, we can start thinking about your own project. The steps will be similar, and some of the work you won't need to repeat.

Garden is a powerful and flexible tool, and there are several things to learn along the way. We recommend the following to get going:

1. Place the project configuration you created for the example, which will be all set to connect to your cluster, in your own project root.
2. Go through the [Using Garden](../using-garden/README.md) documentation section. This will cover all the key concepts, and introduce all the moving parts, including the different module types that Garden supports.
3. Have a look at the [examples](https://github.com/garden-io/garden/tree/0.12.23/examples) folder in the Garden repository, which offers several usage examples that you can refer to while building out your project.
4. Set up your modules, getting them building and deploying, **one at a time**.
5. Make sure your whole project builds and deploys successfully.
6. Start thinking about tests. Garden excels at managing all the different test suites in your stack, especially integration and end-to-end tests that need to run inside your deployment environment.
7. Consider [running Garden in your CI](../guides/using-garden-in-ci.md), to deploy preview environments and/or to test your project.

In summary, **gradually put all the pieces together**, learn the details as you go, and use more and more features as you get comfortable.

For a large, complex project, it might be good to start with a subset of it, so that you can start getting value out of Garden quickly.

Whatever your setup is, we're sure you'll be rewarded with an elegant, productive setup for testing and developing your system!
