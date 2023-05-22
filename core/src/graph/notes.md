# Graph v2 notes

Actions exist in three stages:

**The base**
Partially resolved without dependencies resolved, and `variables` and the type-specific `spec` fields only partially resolved. This is what's in ConfigGraph upon resolution.

**Resolved**
Fully resolved in terms of its configuration, variables, and all its dependencies, but does not have all outputs available. This is enough to call e.g. getStatus, build, deploy handlers.

**Executed**
Includes runtime outputs that are only available after building, deploying etc. These are necessary to resolve dependencies that reference action outputs.

The "do" tasks (BuildTask, DeployTask etc.) for each action kind, plus DeleteDeployTask, are the only ones that don't require a action
