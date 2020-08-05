This is a dummy local version of a remote project source. That is, a remote source that a user has a copy of on their local machine and wants to link to.

Used by the `test-project-ext-project-sources` project for linking its sources to a local path. Equivalent to the following:

```sh
# In test-project-ext-project-sources dir
garden link source source-a ../test-project-local-project-sources/source-a
```