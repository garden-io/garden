# Example project demonstrating the conversion of modules to actions

This project shows how you can convert modules to actions. The `node-service` directory contains two files:

- `garden.old.yml` with the old modules style configuration
- `garden.yml` with the new actions style configuration

In both modules as well as actions, it is possible to define multiple instances in the same directory and yaml file.

This is useful, for example, when you want to use more than one Dockerfile for the same code.

```shell
$ garden deploy
Deploy 🚀

✔ a                       → Building a:v-602ae70cb8... → Done (took 9.1 sec)
✔ b                      → Building b:v-602ae70cb8-... → Done (took 8.9 sec)
✔ b                      → Deploying version v-602ae70cb8... → Done (took 4 sec)
✔ a                       → Deploying version v-602ae70cb8... → Done (took 3.9 sec)

Done! ✔️
```
