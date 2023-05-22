This is a dummy local version of a remote action source. That is, a remote action that a user has a copy of on their local machine and wants to link to.

Used by the `test-projects/ext-action-sources` project for linking its actions to a local path. Equivalent to the following:

```sh
# In test-projects/ext-action-sources dir
garden link action build.a ../test-projects/local-action-sources/build-a
```