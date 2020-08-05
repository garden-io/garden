This is a dummy local version of a remote module source. That is, a remote module that a user has a copy of on their local machine and wants to link to.

Used by the `test-project-ext-module-sources` project for linking its modules to a local path. Equivalent to the following:

```sh
# In test-project-ext-module-sources dir
garden link module module-a ../test-project-local-module-sources/module-a
```