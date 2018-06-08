# Motivation

The landscape of server-side development has changed immensely over the last decade.
This has partly been driven by evolving needs — **scalability has become table-stakes for most 
projects and companies** — and also by the rapid development and proliferation of new technologies
like containers.

From an operations standpoint, all of this is fantastic. Scaling out is increasingly simple 
and cost-effective, and managing production systems is easier than ever. So much so, that the
notion of DevOps has caught on — if ops is so easy, why not have the developers do it
themselves?

And the promise of it all is great. Microservices, immutable infrastructure, continuous 
integration and deployment, all that jazz. Trouble is, all this tends to come at the expense 
of application developer productivity. In embracing these new technologies and tools, we've 
_over-optimized for ops, and in turn made it more difficult and tedious to work on the actual
application code_.

Now, rather than lament and pine for the good ol' monolith days, we at Garden feel that this can
be addressed by **a new generation of developer tooling**. So that's what we've set out to make.
It's certainly not a trivial task, but we truly believe that it's possible to not only reclaim the 
rapid feedback loops we're used to when developing individual services, but to go further and
leverage the benefits of modern backend platforms to make development easier and faster than ever.

So think of Garden as the missing layer on top of Kubernetes, AWS, GCP, etc., that focuses purely
on the **developer experience**, makes it trivial to work across multiple platforms, and closes the
gap between infrastructure and application development.

We do this by frameworking around the basic primitives of development — building, testing, 
debugging and deploying — and making the _how_ of each of those pluggable and configurable.
This allows the framework to grow with you and adapt as your needs evolve in terms of how you
architect and run your code in production, and allows us to easily tie together all the amazing
open-source tools that are being developed in the ecosystem, into an **integrated, consistent 
and easy-to-use development framework**.
