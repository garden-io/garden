# Example project demonstrating several modules/Dockerfiles in one directory

This project shows how you can configure several modules in a single directory.

This is useful, for example, when you want to use more than one Dockerfile for the same code.

```shell
$ garden deploy
Deploy 🚀

✔ a                       → Building a:v-602ae70cb8... → Done (took 9.1 sec)
✔ b                      → Building b:v-602ae70cb8-... → Done (took 8.9 sec)
✔ b                      → Deploying version v-602ae70cb8... → Done (took 4 sec)
✔ a                       → Deploying version v-602ae70cb8... → Done (took 3.9 sec)

Done! ✔️

$ garden call a
✔ Sending HTTP GET request to http://multiple-modules.local.app.garden/hello-a

200 OK

Greetings! This container was built with Dockerfile-a.

$ garden call b
✔ Sending HTTP GET request to http://multiple-modules.local.app.garden/hello-b

200 OK

Greetings! This container was built with Dockerfile-b.
```