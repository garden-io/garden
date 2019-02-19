# Example project demonstrating several modules/Dockerfiles in one directory

This project shows how you can configure several modules in a single directory.

This is useful, for exmample, when you want to use more than one Dockerfile (e.g. one for development, one for production).

```shell
$ garden deploy
Deploy 🚀

✔ dev                       → Building dev:602ae70cb8-1550064758... → Done (took 9.1 sec)
✔ prod                      → Building prod:602ae70cb8-1550064758... → Done (took 8.9 sec)
✔ prod                      → Deploying version 602ae70cb8-1550064758... → Done (took 4 sec)
✔ dev                       → Deploying version 602ae70cb8-1550064758... → Done (took 3.9 sec)

Done! ✔️

$ garden call dev
✔ Sending HTTP GET request to http://multiple-modules.local.app.garden/hello-dev

200 OK

Greetings! This container was built with Dockerfile-dev.

$ garden call prod
✔ Sending HTTP GET request to http://multiple-modules.local.app.garden/hello-prod

200 OK

Greetings! This container was built with Dockerfile-prod.
```