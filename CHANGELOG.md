
<a name="v0.9.0-rc2"></a>
## [v0.9.0-rc2](https://github.com/garden-io/garden/compare/v0.9.0-rc1...v0.9.0-rc2) (2019-02-04)

### Bug Fixes

* **core:** using module version in templates didn't work with watch ([6c209af](https://github.com/garden-io/garden/commit/6c209af))
* **core:** certain template strings could not be resolved in configs ([3d582c4](https://github.com/garden-io/garden/commit/3d582c4))
* **get-tasks:** print msg if no tasks found ([f64d59c](https://github.com/garden-io/garden/commit/f64d59c))
* **k8s:** incorrect role binding for tiller service account ([9a61840](https://github.com/garden-io/garden/commit/9a61840))
* **openfaas:** override release name to avoid conflict across namespaces ([2eea9bd](https://github.com/garden-io/garden/commit/2eea9bd))
* **server:** ensure log entries have level silly ([#496](https://github.com/garden-io/garden/issues/496)) ([5b11322](https://github.com/garden-io/garden/commit/5b11322))

### Code Refactoring

* **commands:** remove create commands ([88d18d8](https://github.com/garden-io/garden/commit/88d18d8))
* **logger:** rename preserveLevel opt to childEntriesInheritLevel ([0b3efab](https://github.com/garden-io/garden/commit/0b3efab))

### BREAKING CHANGE


Module configurations using the `services` template key need to be
updated to use `modules` instead.

The (admittedly poorly supported) google-cloud-function module type has
been changed to include only one function per module. This is more
consistent with other module types, and avoids complex refactoring
to fit with the changes in the templating context.

After this, the `create project` and `create module` commands will no
longer be available. We're removing them for now because currently
they're more confusing than they are useful. There's an open Github}

<a name="v0.9.0-rc1"></a>
## [v0.9.0-rc1](https://github.com/garden-io/garden/compare/v0.8.1...v0.9.0-rc1) (2019-01-28)

### Bug Fixes

* add missing package to garden-service/package.json ([4688e56](https://github.com/garden-io/garden/commit/4688e56))
* don't watch project-level log files ([81c8d04](https://github.com/garden-io/garden/commit/81c8d04))
* add path to module validation error messages ([b1c54b0](https://github.com/garden-io/garden/commit/b1c54b0))
* **dashboard:** limit number of log lines that are fetched ([#461](https://github.com/garden-io/garden/issues/461)) ([3c214ce](https://github.com/garden-io/garden/commit/3c214ce))
* **exec:** missing tasks key in module schema ([cc13f33](https://github.com/garden-io/garden/commit/cc13f33))
* **get-tasks:** print msg if no tasks found ([0868a98](https://github.com/garden-io/garden/commit/0868a98))
* **perf:** reuse port-forwards when hot-reloading ([6db83a7](https://github.com/garden-io/garden/commit/6db83a7))

### Code Refactoring

* add configureProvider plugin action ([bdf6994](https://github.com/garden-io/garden/commit/bdf6994))
* rename `validate` module action to `configure` ([7b02fdd](https://github.com/garden-io/garden/commit/7b02fdd))
* use events for file watching instead of callbacks ([f6a99c2](https://github.com/garden-io/garden/commit/f6a99c2))
* rename `generic` plugin to `exec` ([4c85d46](https://github.com/garden-io/garden/commit/4c85d46))
* **dashboard:** use React Hooks API for state management ([588dd6c](https://github.com/garden-io/garden/commit/588dd6c))
* **dashboard:** rename root dir to dashboard ([6b48430](https://github.com/garden-io/garden/commit/6b48430))
* **k8s:** shorten default namespace names ([15aa5de](https://github.com/garden-io/garden/commit/15aa5de))
* **k8s:** minor change to speed up container deploys ([91da102](https://github.com/garden-io/garden/commit/91da102))

### Features

* add servicePort config option ([57b23f3](https://github.com/garden-io/garden/commit/57b23f3))
* added get tasks command ([250315d](https://github.com/garden-io/garden/commit/250315d))
* rename command to args for container type ([84f5a8d](https://github.com/garden-io/garden/commit/84f5a8d))
* **dashboard:** update UI (closes [#460](https://github.com/garden-io/garden/issues/460)) ([e59897c](https://github.com/garden-io/garden/commit/e59897c))
* **dashboard:** expose provider links in sidebar ([48c9e13](https://github.com/garden-io/garden/commit/48c9e13))
* **k8s:** add Helm module inheritance via the `base` field ([8a7a7e5](https://github.com/garden-io/garden/commit/8a7a7e5))
* **k8s:** proper support for Helm charts ([48f0375](https://github.com/garden-io/garden/commit/48f0375))
* **k8s:** make hot reloading work for remote clusters ([7ca3dc3](https://github.com/garden-io/garden/commit/7ca3dc3))
* **k8s:** allow disabling nginx setup in local-kubernetes provider ([33511bc](https://github.com/garden-io/garden/commit/33511bc))
* **versioncmd:** add version command ([8be4761](https://github.com/garden-io/garden/commit/8be4761))

### BREAKING CHANGE


We no longer default to "nginx" as the ingress class to annotation
container module ingresses. If you need it configured, you need to set
it via the `ingressClass` parameter in the `local-kubernetes` provider
configuration.

After updating, the following configuration fields for container modules
must be renamed as indicated:

  * service.command -> service.args
  * service.hotReloadCommand -> service.hotReloadArgs
  * test.command -> test.args
  * task.command -> task.args

This is done in preparation for a new configuration option (using the
key `command`, hence the rename) that's planned for release soon,
whereby users can override the current default of running
tests / tasks / ad-hoc commands inside containers via
`/bin/sh -c [args]`.

After updating, any project that doesn't have an explicitly
configured namespace will be installed into a new namespace,
and the old namespace needs to be manually removed.

Projects using the `generic` module type need to update the relevant
`garden.yml` files, to reference the `exec` module type instead.

The `--tail|-t` flag for the `garden logs` command now takes an integer parameter
and specifies the number of log lines to display, whereas previously it was a boolean
flag that determined whether or not to stream the logs. For streaming, we now have
the `--follow|-f` flag. This conforms to other similar CLI tools.

<a name="v0.8.1"></a>
## [v0.8.1](https://github.com/garden-io/garden/compare/v0.8.1-rc1...v0.8.1) (2018-12-10)

### Bug Fixes

* **dashboard:** fix contants import in setupProxy.js ([e2c5bbd](https://github.com/garden-io/garden/commit/e2c5bbd))
* **k8s:** revert removal of `-i` flag on kubectl run commands ([663deea](https://github.com/garden-io/garden/commit/663deea))
* **k8s:** incorrect flags sent to `kubectl run` when not interactive ([260b976](https://github.com/garden-io/garden/commit/260b976))
* **log:** log footer line was duplicated after config reload ([a8b50b1](https://github.com/garden-io/garden/commit/a8b50b1))
* **tasks:** task errors had lost their color ([66390e1](https://github.com/garden-io/garden/commit/66390e1))

### Code Refactoring

* **task-graph:** add task key to TaskResult interface ([3ce6633](https://github.com/garden-io/garden/commit/3ce6633))


<a name="v0.8.1-rc1"></a>
## [v0.8.1-rc1](https://github.com/garden-io/garden/compare/v0.8.0...v0.8.1-rc1) (2018-12-10)

### Bug Fixes

* do not run dependant tasks unless updated services depend on them ([1ae0284](https://github.com/garden-io/garden/commit/1ae0284))
* minor logging issue ([61e4428](https://github.com/garden-io/garden/commit/61e4428))
* stale version in some tasks triggered by watch handler ([da134b4](https://github.com/garden-io/garden/commit/da134b4))
* performance regression on startup ([b856e36](https://github.com/garden-io/garden/commit/b856e36))
* fixed another dependency calculation bug ([99df5d9](https://github.com/garden-io/garden/commit/99df5d9))
* fixed dependency bug & simplified TaskGraph ([4a8428c](https://github.com/garden-io/garden/commit/4a8428c))
* make dev cmd consistent with deploy cmd ([85f31f9](https://github.com/garden-io/garden/commit/85f31f9))
* fix dev command terminating on config change ([261e974](https://github.com/garden-io/garden/commit/261e974))
* **k8s:** exec and run commands didn't work properly in interactive mode ([420953d](https://github.com/garden-io/garden/commit/420953d))
* **k8s:** log tailing now returns logs for new pods at runtime ([432e6dc](https://github.com/garden-io/garden/commit/432e6dc))
* **k8s:** remove replicasets and daemonsets when deleting services ([6c63314](https://github.com/garden-io/garden/commit/6c63314))

### Code Refactoring

* nicer logging when watching for changes / hot reloading ([069a9d0](https://github.com/garden-io/garden/commit/069a9d0))
* rename plural command parameters ([f010e37](https://github.com/garden-io/garden/commit/f010e37))
* add placeholder method to logger + fix rendering issues ([fa8d81e](https://github.com/garden-io/garden/commit/fa8d81e))
* rename logEntry to log and require for tests, cmds and actions ([13cf263](https://github.com/garden-io/garden/commit/13cf263))
* **formatting:** improve quoting style of objects to consistent-as-needed ([687c6f3](https://github.com/garden-io/garden/commit/687c6f3))

### Features

* add `get config` command ([39ab7b1](https://github.com/garden-io/garden/commit/39ab7b1))
* added get graph command ([010353e](https://github.com/garden-io/garden/commit/010353e))
* experimental HTTP API ([5302802](https://github.com/garden-io/garden/commit/5302802))
* add websocket endpoint to API server ([e6fcc8b](https://github.com/garden-io/garden/commit/e6fcc8b))
* add event bus + a few events emitted from TaskGraph ([3c19e36](https://github.com/garden-io/garden/commit/3c19e36))
* allow plugins to specify dashboard pages ([c67b7be](https://github.com/garden-io/garden/commit/c67b7be))
* **api:** allow explicitly port for api server in dev cmd ([919e6b8](https://github.com/garden-io/garden/commit/919e6b8))
* **dashboard:** add basic scaffolding with overview and logs section ([3781fb3](https://github.com/garden-io/garden/commit/3781fb3))
* **openfaas:** add log streaming to openfaas plugin ([53131b5](https://github.com/garden-io/garden/commit/53131b5))


<a name="v0.8.0"></a>
## [v0.8.0](https://github.com/garden-io/garden/compare/v0.7.0...v0.8.0) (2018-11-21)

### Bug Fixes

* handle missing services gracefully in logs command ([3fcb73f](https://github.com/garden-io/garden/commit/3fcb73f))
* use plugin-prefixed module names in dep calcs ([7f65c9a](https://github.com/garden-io/garden/commit/7f65c9a))
* use faas-cli to delete OpenFAAS services ([b38113e](https://github.com/garden-io/garden/commit/b38113e))
* allow env variables to be lower case ([b79609c](https://github.com/garden-io/garden/commit/b79609c))
* fixes to hot reload source/target handling ([271917b](https://github.com/garden-io/garden/commit/271917b))
* recursive bug copying .garden into .garden ([7855982](https://github.com/garden-io/garden/commit/7855982))
* skip build task during hot-reloading ([5e24716](https://github.com/garden-io/garden/commit/5e24716))
* set log state to success after deleting env ([19ef038](https://github.com/garden-io/garden/commit/19ef038))
* fix broken doc links ([4a96f4c](https://github.com/garden-io/garden/commit/4a96f4c))
* handle all promises and add no-floating-promises linting rule ([f0b4104](https://github.com/garden-io/garden/commit/f0b4104))
* replace node-pty with node-pty-prebuilt to avoid install issues ([775c98f](https://github.com/garden-io/garden/commit/775c98f))
* include provided deps in module cache keys ([b6652d0](https://github.com/garden-io/garden/commit/b6652d0))
* prevent multiple prefixing in getModuleKey ([2421223](https://github.com/garden-io/garden/commit/2421223))
* incomplete downloads in ext-tool helper ([30a6eb0](https://github.com/garden-io/garden/commit/30a6eb0))
* ignore paths relative to parent dir when scanning modules ([65ba584](https://github.com/garden-io/garden/commit/65ba584))
* add missing parenthesis to windows install script ([850f2d4](https://github.com/garden-io/garden/commit/850f2d4))
* issues with ext tool helper ([641a07c](https://github.com/garden-io/garden/commit/641a07c))
* docs, comments & various fixes ([2d081a0](https://github.com/garden-io/garden/commit/2d081a0))
* incl. ingresses & services in delete command. ([8d3f366](https://github.com/garden-io/garden/commit/8d3f366))
* **cli:** change magenta to cyan in cli help text ([#281](https://github.com/garden-io/garden/issues/281)) ([1580d1b](https://github.com/garden-io/garden/commit/1580d1b))
* **create-command:** add project key to generated config and fix tests ([63cca8f](https://github.com/garden-io/garden/commit/63cca8f))
* **docs:** tweaks to config file reference docs ([de5e4a5](https://github.com/garden-io/garden/commit/de5e4a5))
* **examples:** remove local npm dependency in hello-world example ([d91327e](https://github.com/garden-io/garden/commit/d91327e))
* **ext-tools:** handle end of stream event ([1a36b72](https://github.com/garden-io/garden/commit/1a36b72))
* **git:** error when running before first commit is made in repo ([#324](https://github.com/garden-io/garden/issues/324)) ([7dd77ae](https://github.com/garden-io/garden/commit/7dd77ae))
* **k8s:** fix status check for our K8s deployments ([35187d3](https://github.com/garden-io/garden/commit/35187d3))
* **k8s:** make sure Helm client is initialized on startup ([f1bf4bd](https://github.com/garden-io/garden/commit/f1bf4bd))
* **k8s:** attempt to fix issues with helm release upgrades ([4ec63b7](https://github.com/garden-io/garden/commit/4ec63b7))
* **k8s:** don't throw if api returns 404 when checking object status ([23dc935](https://github.com/garden-io/garden/commit/23dc935))
* **logger:** only print emoji if env supports it ([3e541e1](https://github.com/garden-io/garden/commit/3e541e1))
* **logger:** let empty entries inherit parent indentation level ([9c428cd](https://github.com/garden-io/garden/commit/9c428cd))
* **logger:** appended error messages now rendered properly ([f964b3b](https://github.com/garden-io/garden/commit/f964b3b))
* **logger:** render non-empty entries even though msg is missing ([20f2830](https://github.com/garden-io/garden/commit/20f2830))
* **openfaas:** fix issues with openfaas builds ([f62db2f](https://github.com/garden-io/garden/commit/f62db2f))
* **openfaas:** avoid length issue for helm release name ([ad0e708](https://github.com/garden-io/garden/commit/ad0e708))
* **openfaas:** fix cleanupEnvironment handler ([b080d55](https://github.com/garden-io/garden/commit/b080d55))
* **openfaas:** builder now works on all platforms ([529f63c](https://github.com/garden-io/garden/commit/529f63c))
* **scripts:** Add jq dependancy ([29da4e2](https://github.com/garden-io/garden/commit/29da4e2))
* **windows:** use cross-spawn module to avoid path issues on Windows ([082964c](https://github.com/garden-io/garden/commit/082964c))

### Code Refactoring

* rename "workflow" to "task" ([4c7230a](https://github.com/garden-io/garden/commit/4c7230a))
* rename Task to BaseTask ([9b40291](https://github.com/garden-io/garden/commit/9b40291))
* a few changes to facilitate packaging/bundling ([d0e4035](https://github.com/garden-io/garden/commit/d0e4035))
* remove explicit helm and stern installation dependencies ([a160b31](https://github.com/garden-io/garden/commit/a160b31))
* add buildDependencies key to plugin module action params ([b24c6a9](https://github.com/garden-io/garden/commit/b24c6a9))
* remove node-pty dependency ([5082196](https://github.com/garden-io/garden/commit/5082196))
* rename `init env` cmd to `init` and remove login cmd ([2998bc4](https://github.com/garden-io/garden/commit/2998bc4))
* **build:** remove dependancy on git submodule for k8s ([d284494](https://github.com/garden-io/garden/commit/d284494))
* **cli:** remove single char command aliases ([d562fe2](https://github.com/garden-io/garden/commit/d562fe2))
* **docs:** improve cli commands help and description text ([d04e97b](https://github.com/garden-io/garden/commit/d04e97b))
* **docs:** re-name auto generated reference files ([cc47d64](https://github.com/garden-io/garden/commit/cc47d64))
* **error-messages:** improve error message for check-docs ([5c4fb3a](https://github.com/garden-io/garden/commit/5c4fb3a))
* **go-cli:** install bin deps where Garden expects them ([13fa57c](https://github.com/garden-io/garden/commit/13fa57c))
* **go-cli:** use docker sdk and keep containers running ([85dfd13](https://github.com/garden-io/garden/commit/85dfd13))
* **multi-repo:** require tag or branch in repository URLs ([be9b116](https://github.com/garden-io/garden/commit/be9b116))

### Features

* tasks/workflows implemented ([de9275b](https://github.com/garden-io/garden/commit/de9275b))
* experimental single-binary build via zeit/pkg ([9f8d7bf](https://github.com/garden-io/garden/commit/9f8d7bf))
* allow custom dockerfile path for container modules ([5ecaead](https://github.com/garden-io/garden/commit/5ecaead))
* added --hot-reload flag to dev & deploy ([c779618](https://github.com/garden-io/garden/commit/c779618))
* hot-reload functionality for local k8s ([ff0001d](https://github.com/garden-io/garden/commit/ff0001d))
* garden-cli container build (experimental) ([7d2b5e7](https://github.com/garden-io/garden/commit/7d2b5e7))
* **cli:** experimental go frontend CLI ([71c5e38](https://github.com/garden-io/garden/commit/71c5e38))
* **k8s:** print error logs when container fails to start ([69b8cf6](https://github.com/garden-io/garden/commit/69b8cf6))
* **k8s:** support remote container registries and remote clusters ([5243c40](https://github.com/garden-io/garden/commit/5243c40))


<a name="v0.7.0"></a>
## [v0.7.0](https://github.com/garden-io/garden/compare/v0.6.0...v0.7.0) (2018-09-17)

### Bug Fixes

* windows install script ([0c2a2f0](https://github.com/garden-io/garden/commit/0c2a2f0))
* **examples-projects:** fix integration test ([1d85a9d](https://github.com/garden-io/garden/commit/1d85a9d))
* **gulpfile:** ensure tmp dir exists when updating brew tap ([3f2ace8](https://github.com/garden-io/garden/commit/3f2ace8))
* **k8s:** name releases based on their namespace ([5fe26e9](https://github.com/garden-io/garden/commit/5fe26e9))
* **openfaas:** better cross-platform support ([d1c59d4](https://github.com/garden-io/garden/commit/d1c59d4))
* **publish script:** ensure changelog is properly generated ([e2f1d8e](https://github.com/garden-io/garden/commit/e2f1d8e))
* **publish-script:** set remote in git push command ([26356bf](https://github.com/garden-io/garden/commit/26356bf))

### Code Refactoring

* rename endpoints to ingresses ([dde932f](https://github.com/garden-io/garden/commit/dde932f))
* tighten plugin context API considerably ([af2af06](https://github.com/garden-io/garden/commit/af2af06))
* **logger:** clean up code + enable empty log entries ([a83117a](https://github.com/garden-io/garden/commit/a83117a))

### Features

* windows installer cont'd (to be squashed) ([5ff7af5](https://github.com/garden-io/garden/commit/5ff7af5))
* windows installer ([70c44ab](https://github.com/garden-io/garden/commit/70c44ab))

### BREAKING CHANGE


Users may need to delete and re-init their projects when using the
Kubernetes plugins after installing this update, because Helm may get
confused by the changes.


<a name="v0.6.0"></a>
## [v0.6.0](https://github.com/garden-io/garden/compare/v0.5.1...v0.6.0) (2018-09-17)

### Bug Fixes

* **publish-script:** set remote in git push command ([aa03557](https://github.com/garden-io/garden/commit/aa03557))


<a name="v0.5.1"></a>
## [v0.5.1](https://github.com/garden-io/garden/compare/v0.5.0...v0.5.1) (2018-09-13)

### Bug Fixes

* fix ignore package import ([00721c3](https://github.com/garden-io/garden/commit/00721c3))
* catch and log task errors as they happen ([46eef92](https://github.com/garden-io/garden/commit/46eef92))
* fix publish script ([7d84751](https://github.com/garden-io/garden/commit/7d84751))
* **call-command:** print correct protocol ([d973058](https://github.com/garden-io/garden/commit/d973058))
* **config:** remove name field from service endpoint spec ([9f6f9f0](https://github.com/garden-io/garden/commit/9f6f9f0))
* **examples:** unused import in go-service ([25509cf](https://github.com/garden-io/garden/commit/25509cf))
* **examples-projects:** fix integration test ([1d85a9d](https://github.com/garden-io/garden/commit/1d85a9d))
* **openfaas:** external endpoints had incorrect path ([64de898](https://github.com/garden-io/garden/commit/64de898))

### Code Refactoring

* rename endpoints to ingresses ([dde932f](https://github.com/garden-io/garden/commit/dde932f))
* tighten plugin context API considerably ([af2af06](https://github.com/garden-io/garden/commit/af2af06))
* get rid of native OpenSSL dependency ([64e962a](https://github.com/garden-io/garden/commit/64e962a))
* **logger:** clean up code + enable empty log entries ([a83117a](https://github.com/garden-io/garden/commit/a83117a))

### BREAKING CHANGE


Endpoint names will have to be removed from module configs.


<a name="v0.5.0"></a>
## [v0.5.0](https://github.com/garden-io/garden/compare/v0.4.0...v0.5.0) (2018-09-05)

### Bug Fixes

* init file writers in Garden class ([d982b66](https://github.com/garden-io/garden/commit/d982b66))
* add axios as dependency (was dev dependency) ([4ccdfd8](https://github.com/garden-io/garden/commit/4ccdfd8))
* **k8s:** don't deploy system services when running minikube ([215cabd](https://github.com/garden-io/garden/commit/215cabd))
* **k8s:** wait for Tiller pod to be ready when initializing ([a5cd8eb](https://github.com/garden-io/garden/commit/a5cd8eb))
* **logger:** ensure ansi chars in section don't break format ([323b6e9](https://github.com/garden-io/garden/commit/323b6e9))
* **multi-repo:** ensure external source gets updated if repo url changes ([881c3c7](https://github.com/garden-io/garden/commit/881c3c7))
* **tests:** ensure test project is clean between tests ([b7f6664](https://github.com/garden-io/garden/commit/b7f6664))

### Code Refactoring

* move project config scan to separate function ([db8e8ed](https://github.com/garden-io/garden/commit/db8e8ed))
* remove stale module name check ([2f3a94f](https://github.com/garden-io/garden/commit/2f3a94f))
* configs are now fully resolved ahead of time in one pass ([a5e5526](https://github.com/garden-io/garden/commit/a5e5526))
* **ctx:** allow specifying plugin name when calling plugin actions ([dec8e35](https://github.com/garden-io/garden/commit/dec8e35))

### Features

* allow configs from subdirectories ([bb464c3](https://github.com/garden-io/garden/commit/bb464c3))
* add 'delete service' command ([2b067c6](https://github.com/garden-io/garden/commit/2b067c6))
* **k8s:** support custom hostnames and TLS certs ([1c004f7](https://github.com/garden-io/garden/commit/1c004f7))
* **multi-repos:** allow file URLs ([c072dd9](https://github.com/garden-io/garden/commit/c072dd9))


<a name="v0.4.0"></a>
## [v0.4.0](https://github.com/garden-io/garden/compare/v0.3.1...v0.4.0) (2018-08-14)

### Bug Fixes

* fix linux-specific shellscript errors and integ test ([#229](https://github.com/garden-io/garden/issues/229)) ([1dc936e](https://github.com/garden-io/garden/commit/1dc936e))
* **cli:** task results errors weren't handled properly ([b22b580](https://github.com/garden-io/garden/commit/b22b580))
* **cli:** allow empty path when calling services via `garden call` ([b5d4972](https://github.com/garden-io/garden/commit/b5d4972))
* **cli:** show ANSI banner image instead of png in dev command ([bb3898f](https://github.com/garden-io/garden/commit/bb3898f))
* **k8s:** build status was incorrectly reported for helm modules ([195eee4](https://github.com/garden-io/garden/commit/195eee4))

### Code Refactoring

* **config:** make module name mandatory ([aa83d7f](https://github.com/garden-io/garden/commit/aa83d7f))
* **k8s:** make deployment and status checks much more robust ([97f7bf6](https://github.com/garden-io/garden/commit/97f7bf6))

### Features

* add multi-repo support ([740e858](https://github.com/garden-io/garden/commit/740e858))
* add OpenFaaS plugin (experimental) ([39ff701](https://github.com/garden-io/garden/commit/39ff701))
* add exec command, to run commands in running service containers ([7f74edc](https://github.com/garden-io/garden/commit/7f74edc))
* add Windows support (experimental) ([9e9c218](https://github.com/garden-io/garden/commit/9e9c218))
* **k8s:** allow specifying namespace to deploy to ([0aebc2b](https://github.com/garden-io/garden/commit/0aebc2b))

### BREAKING CHANGE


Module name no longer defaults to directory name but must be explicitly
set in the module's garden.yml file. Any existing garden.yml module files
without a name key must therefore be updated to expclitily provide the
module name.


<a name="v0.3.1"></a>
## [v0.3.1](https://github.com/garden-io/garden/compare/v0.3.0...v0.3.1) (2018-07-16)

### Bug Fixes

* **versioning:** `resolveVersion` should not call `getTreeVersion` ([91ae14f](https://github.com/garden-io/garden/commit/91ae14f))
* **versioning:** version string should include dirty timestamp ([61d29d0](https://github.com/garden-io/garden/commit/61d29d0))


<a name="v0.3.0"></a>
## [v0.3.0](https://github.com/garden-io/garden/compare/v0.2.0...v0.3.0) (2018-07-10)

### Bug Fixes

* fixed more issues with cross-repo versioning ([2b0d93e](https://github.com/garden-io/garden/commit/2b0d93e))
* set identifier max length to match k8s service name limit ([ad0a54f](https://github.com/garden-io/garden/commit/ad0a54f))
* ensure namespace is removed before returning when deleting env ([f381d33](https://github.com/garden-io/garden/commit/f381d33))
* **create-commands:** rename function type to google-cloud-function ([49c4c93](https://github.com/garden-io/garden/commit/49c4c93))
* **create-module-command:** type option should be an enum ([a8316d1](https://github.com/garden-io/garden/commit/a8316d1))
* **file-writer:** only create file if content to write ([562daa8](https://github.com/garden-io/garden/commit/562daa8))
* **release:** publish script should exit on error ([075537f](https://github.com/garden-io/garden/commit/075537f))

### Code Refactoring

* build command is now an array, for consistency ([0bf020a](https://github.com/garden-io/garden/commit/0bf020a))
* always load container and npm-package plugins ([4bf5d18](https://github.com/garden-io/garden/commit/4bf5d18))
* remove dependency on watchman ([fec104a](https://github.com/garden-io/garden/commit/fec104a))
* **k8s:** ensure namespaces are created when needed ([67946eb](https://github.com/garden-io/garden/commit/67946eb))
* **k8s:** change metadata namespace name ([6f73299](https://github.com/garden-io/garden/commit/6f73299))

### Features

* add create project/module commands ([b611b35](https://github.com/garden-io/garden/commit/b611b35))
* allow numeric log levels ([e2a7b6f](https://github.com/garden-io/garden/commit/e2a7b6f))
* **cli:** enable custom hints in help message ([37c3159](https://github.com/garden-io/garden/commit/37c3159))
* **config:** add `${local.platform}` template key ([1c6d492](https://github.com/garden-io/garden/commit/1c6d492))
* **container:** add `env` key to specify env vars for containers ([9fa0cb8](https://github.com/garden-io/garden/commit/9fa0cb8))
* **generic:** add env var support to generic module type ([a5096ee](https://github.com/garden-io/garden/commit/a5096ee))
* **k8s:** allow specifying default username in k8s provider config ([1e42cfb](https://github.com/garden-io/garden/commit/1e42cfb))
* **k8s:** add repo parameter to helm module type ([5d3af14](https://github.com/garden-io/garden/commit/5d3af14))

### Performance Improvements

* generic plugin now keeps track of last built version ([ab3714b](https://github.com/garden-io/garden/commit/ab3714b))

### BREAKING CHANGE


Any existing garden.yml files with the `build.command` key set need
to be updated to provide an array of strings as a command, as opposed to
a simple string.

Existing metadata namespaces will have to be manually cleaned up.
We suggest resetting local k8s clusters after upgrading.

The `tests[].variables` config key has been removed from the
`garden.yml` configuration file schema.


<a name="v0.2.0"></a>
## [v0.2.0](https://github.com/garden-io/garden/compare/v0.2.0-0...v0.2.0) (2018-06-27)


<a name="v0.2.0-0"></a>
## [v0.2.0-0](https://github.com/garden-io/garden/compare/v0.1.2...v0.2.0-0) (2018-06-27)

### Bug Fixes

* malformed output from `ctx.getStatus()` ([#134](https://github.com/garden-io/garden/issues/134)) ([d222721](https://github.com/garden-io/garden/commit/d222721))
* pin npm version in CircleCI ([206d946](https://github.com/garden-io/garden/commit/206d946))
* error in `Module.getVersion()` ([6491678](https://github.com/garden-io/garden/commit/6491678))
* broken `npm run dev` after package.json changes ([8bd6217](https://github.com/garden-io/garden/commit/8bd6217))
* module versions are now handled properly across multiple repos ([c647cf9](https://github.com/garden-io/garden/commit/c647cf9))
* test result versions now correctly account for test dependencies ([8b8a6bd](https://github.com/garden-io/garden/commit/8b8a6bd))
* add missing lodash dependency (!) ([2abb90c](https://github.com/garden-io/garden/commit/2abb90c))
* don't run dist script on every npm install ([c73f5e1](https://github.com/garden-io/garden/commit/c73f5e1))
* **ci:** only do clean install from package-lock ([3c44191](https://github.com/garden-io/garden/commit/3c44191))
* **cli:** delete environment command wasn't linked to parent ([e0789f1](https://github.com/garden-io/garden/commit/e0789f1))
* **cli:** set error code when calling CLI with bad command ([bb24acd](https://github.com/garden-io/garden/commit/bb24acd))
* **cli:** enforce single character option aliases ([a49e799](https://github.com/garden-io/garden/commit/a49e799))
* **cli:** add missing shebang line in garden binary ([632925d](https://github.com/garden-io/garden/commit/632925d))
* **container:** build issue where Dockerfile is copied or generated ([c0186d9](https://github.com/garden-io/garden/commit/c0186d9))
* **core:** potential race-condition when parsing modules ([944e150](https://github.com/garden-io/garden/commit/944e150))
* **ctx:** better error.log output from `processModules()` ([b0eb86e](https://github.com/garden-io/garden/commit/b0eb86e))
* **integ:** fix init env command in integ test script ([f644ec2](https://github.com/garden-io/garden/commit/f644ec2))
* **k8s:** better error message when kubectl fails ([41f1482](https://github.com/garden-io/garden/commit/41f1482))
* **k8s:** incorrect use of execa ([cecbaa3](https://github.com/garden-io/garden/commit/cecbaa3))
* **k8s:** patch bugs in kubernetes client ([e45f72a](https://github.com/garden-io/garden/commit/e45f72a))
* **logger:** remove unnecessary call to stopLoop ([db84561](https://github.com/garden-io/garden/commit/db84561))
* **vsc:** handle weird stat behavior by wrapping it ([df11647](https://github.com/garden-io/garden/commit/df11647))

### Code Refactoring

* consistently use verb before noun in CLI ([e88e55e](https://github.com/garden-io/garden/commit/e88e55e))
* switch to official kubernetes client library ([8ccd9a1](https://github.com/garden-io/garden/commit/8ccd9a1))
* rename project.global to project.environmentDefaults ([#131](https://github.com/garden-io/garden/issues/131)) ([3ebe1dc](https://github.com/garden-io/garden/commit/3ebe1dc))

### Features

* generate homebrew formula on publish ([72c4b4d](https://github.com/garden-io/garden/commit/72c4b4d))
* **build:** Handle config changes in auto-reload. ([9d9295f](https://github.com/garden-io/garden/commit/9d9295f))
* **k8s:** add helm module type ([122e6dd](https://github.com/garden-io/garden/commit/122e6dd))

### Performance Improvements

* implemented caching of module version ([e451f7a](https://github.com/garden-io/garden/commit/e451f7a))
* got rid of all synchronous subprocess and filesystem calls ([9b62424](https://github.com/garden-io/garden/commit/9b62424))

### BREAKING CHANGE


The following CLI commands have now been renamed, and any scripts
using them need to be updated accordingly:
`config delete` -> `delete config`
`config get` -> `get config`
`config set` -> `set config`
`environment configure` -> `init environment`
`environment destroy` -> `delete environment`
`status` -> `get status`

Existing garden.yml files will need to be updated if they use the
project.global key.


<a name="v0.1.2"></a>
## [v0.1.2](https://github.com/garden-io/garden/compare/v0.1.1-0...v0.1.2) (2018-06-02)


<a name="v0.1.1-0"></a>
## [v0.1.1-0](https://github.com/garden-io/garden/compare/v0.1.0...v0.1.1-0) (2018-06-02)

### Bug Fixes

* add missing prepublish step ([a1dbde9](https://github.com/garden-io/garden/commit/a1dbde9))
* incorrect bin link in package.json ([237ce85](https://github.com/garden-io/garden/commit/237ce85))
* **utils:** gulp dev dependencies and update util/index ([9e65f02](https://github.com/garden-io/garden/commit/9e65f02))


<a name="v0.1.0"></a>
## v0.1.0 (2018-05-31)

### Bug Fixes

* allow empty output from test runs ([67a2d95](https://github.com/garden-io/garden/commit/67a2d95))
* syntax error in .release-it.json ([010a138](https://github.com/garden-io/garden/commit/010a138))
* allow commands to specify logger type ([893f9e2](https://github.com/garden-io/garden/commit/893f9e2))
* add missing license header ([f6e11d9](https://github.com/garden-io/garden/commit/f6e11d9))
* [#107](https://github.com/garden-io/garden/issues/107) & [#108](https://github.com/garden-io/garden/issues/108) - incl. deps in auto-reload. ([d1aaf5e](https://github.com/garden-io/garden/commit/d1aaf5e))
* ensure module build paths have trailing slash (for rsync) ([1c555d1](https://github.com/garden-io/garden/commit/1c555d1))
* fix default log level on header and finish methods ([1eb143d](https://github.com/garden-io/garden/commit/1eb143d))
* [#85](https://github.com/garden-io/garden/issues/85) closing gulp watch didn't close tsc process ([4b3a7c4](https://github.com/garden-io/garden/commit/4b3a7c4))
* partial CircleCI status on PRs ([7d0a3ef](https://github.com/garden-io/garden/commit/7d0a3ef))
* regression after splitting up GardenContext ([bbb6db5](https://github.com/garden-io/garden/commit/bbb6db5))
* issue where module scanning would hang with empty projects ([ec47c72](https://github.com/garden-io/garden/commit/ec47c72))
* bug in CLI when handling errors ([f7ae4dd](https://github.com/garden-io/garden/commit/f7ae4dd))
* better and more consistent error handling in CLI commands ([36ba7b7](https://github.com/garden-io/garden/commit/36ba7b7))
* service outputs were not propagated to runtime context ([0151593](https://github.com/garden-io/garden/commit/0151593))
* bad timestamp values could crash log command ([4383d75](https://github.com/garden-io/garden/commit/4383d75))
* propagate force flag to deployService action ([6ccc9d0](https://github.com/garden-io/garden/commit/6ccc9d0))
* wrong function name in local-gcf-container ([7a7d5af](https://github.com/garden-io/garden/commit/7a7d5af))
* error handling in hello-container ([f778fe9](https://github.com/garden-io/garden/commit/f778fe9))
* issue with gulp watch and static files ([dc9cd9f](https://github.com/garden-io/garden/commit/dc9cd9f))
* use built-in ingress controller and dashboard for minikube ([879bce2](https://github.com/garden-io/garden/commit/879bce2))
* deploy command would deploy all services from each processed module ([673630c](https://github.com/garden-io/garden/commit/673630c))
* Cancel dependants on task error. ([6831608](https://github.com/garden-io/garden/commit/6831608))
* temporarily disabling minikube tests in CI (issues with CircleCI) ([5e1b4bc](https://github.com/garden-io/garden/commit/5e1b4bc))
* better error output when gulp add-version-files fails ([0fc4ee4](https://github.com/garden-io/garden/commit/0fc4ee4))
* Cache results to skip superfluous tasks. ([0632e36](https://github.com/garden-io/garden/commit/0632e36))
* fix destroy env command after kubernetes-client upgrade ([200fd01](https://github.com/garden-io/garden/commit/200fd01))
* print json/yaml output after cli returns parse results ([eeadf16](https://github.com/garden-io/garden/commit/eeadf16))
* disable ts-node cache in tests to avoid inconsistencies ([21f2d44](https://github.com/garden-io/garden/commit/21f2d44))
* version is now correctly set for plugin modules ([#84](https://github.com/garden-io/garden/issues/84)) ([d9c3757](https://github.com/garden-io/garden/commit/d9c3757))
* remove .vscode directories in multi-container example ([ccd426d](https://github.com/garden-io/garden/commit/ccd426d))
* add missing copyright-header dependency on CircleCI ([ceca5c4](https://github.com/garden-io/garden/commit/ceca5c4))
* add missing dependencies for copyright-header on OSX ([d4d639f](https://github.com/garden-io/garden/commit/d4d639f))
* k8s plugin now respects configured context ([a395b79](https://github.com/garden-io/garden/commit/a395b79))
* testModule handlers now receive runtime context ([6ea60b0](https://github.com/garden-io/garden/commit/6ea60b0))
* better output rendering for JSON responses in call command ([1aecfe0](https://github.com/garden-io/garden/commit/1aecfe0))
* better handling of streams not from logger ([42fa17e](https://github.com/garden-io/garden/commit/42fa17e))
* linting errors in tests ([185eb69](https://github.com/garden-io/garden/commit/185eb69))
* better kubectl errors ([76fabd6](https://github.com/garden-io/garden/commit/76fabd6))
* minor logging fixes ([bde56fa](https://github.com/garden-io/garden/commit/bde56fa))
* Correction to FS watcher subscription logic. ([5969914](https://github.com/garden-io/garden/commit/5969914))
* test name was not included in test result keys ([3dac186](https://github.com/garden-io/garden/commit/3dac186))
* Added OperationQueue to TaskGraph. ([ae79785](https://github.com/garden-io/garden/commit/ae79785))
* linting errors ([e839e8e](https://github.com/garden-io/garden/commit/e839e8e))
* re-implemented local GCF plugin to fix issues ([3f2ee33](https://github.com/garden-io/garden/commit/3f2ee33))
* add better error logging for kubectl and rsync ([212304a](https://github.com/garden-io/garden/commit/212304a))
* issue where build dependencies couldn't be copied ([d3a44cd](https://github.com/garden-io/garden/commit/d3a44cd))
* changed how paths are handled when copying build dependencies ([d6506da](https://github.com/garden-io/garden/commit/d6506da))
* allow unkown keys in baseModuleSchema ([78303de](https://github.com/garden-io/garden/commit/78303de))
* added missing "Done!" message at end of build command ([a05f2c5](https://github.com/garden-io/garden/commit/a05f2c5))
* build staging no longer copies symlinks ([0fc60bd](https://github.com/garden-io/garden/commit/0fc60bd))
* issues with kubernetes-client after upgrade ([f4096a2](https://github.com/garden-io/garden/commit/f4096a2))
* better logger types ([56596fb](https://github.com/garden-io/garden/commit/56596fb))
* package.json & .snyk to reduce vulnerabilities ([0766b56](https://github.com/garden-io/garden/commit/0766b56))
* **cli:** duplicate command checks now accounts for subcommands ([b9e22f5](https://github.com/garden-io/garden/commit/b9e22f5))
* **cli:** map all Errors to GardenErrors and log accordingly ([02b05b3](https://github.com/garden-io/garden/commit/02b05b3))
* **hello-world:** npm package is now included in function build ([2795653](https://github.com/garden-io/garden/commit/2795653))
* **hello-world-example:** add missing Dockerfile directives ([4acc4cc](https://github.com/garden-io/garden/commit/4acc4cc))
* **logger:** more performant update function ([4d8c89e](https://github.com/garden-io/garden/commit/4d8c89e))
* **logger:** fix basic-terminal-writer superflous newline ([bfc0fcf](https://github.com/garden-io/garden/commit/bfc0fcf))

### Code Refactoring

* move invalid flags check to command setup function ([ee89b74](https://github.com/garden-io/garden/commit/ee89b74))
* split up writers into separate modules ([e528b35](https://github.com/garden-io/garden/commit/e528b35))
* add processServices alongside processModules helper ([4871022](https://github.com/garden-io/garden/commit/4871022))
* major hardening of internal plugin APIs ([242d0aa](https://github.com/garden-io/garden/commit/242d0aa))
* changed YAML spec to use lists instead of maps in most places ([f1d2548](https://github.com/garden-io/garden/commit/f1d2548))
* remove unusued watchModules command ([920eacc](https://github.com/garden-io/garden/commit/920eacc))
* merge autoreload command into dev command ([3c78c36](https://github.com/garden-io/garden/commit/3c78c36))
* remove skipAutoReload option ([f96fc5f](https://github.com/garden-io/garden/commit/f96fc5f))
* replaced build and test scripts with gulpfile ([05e3c73](https://github.com/garden-io/garden/commit/05e3c73))
* changed build dependency copy specs config format ([608f963](https://github.com/garden-io/garden/commit/608f963))
* k8s garden-system now deployed via sub-Garden ([4a79c45](https://github.com/garden-io/garden/commit/4a79c45))
* move some logic from commands to plugin context ([b7173be](https://github.com/garden-io/garden/commit/b7173be))
* major overhaul to plugin architecture ([3b97e08](https://github.com/garden-io/garden/commit/3b97e08))
* split GardenContext into Garden and PluginContext ([04b5417](https://github.com/garden-io/garden/commit/04b5417))
* rename GardenContext to Garden ([64bce4f](https://github.com/garden-io/garden/commit/64bce4f))
* split Kubernetes plugin into more modules ([e6d84e1](https://github.com/garden-io/garden/commit/e6d84e1))

### Features

* created local-kubernetes plugin and added config options ([1fcf88d](https://github.com/garden-io/garden/commit/1fcf88d))
* add truncatePrevious option to file-writer ([a64fbb0](https://github.com/garden-io/garden/commit/a64fbb0))
* add force flag to env config command ([d5ba05b](https://github.com/garden-io/garden/commit/d5ba05b))
* template variables can now access provider name and config ([51e2f33](https://github.com/garden-io/garden/commit/51e2f33))
* support and documentation for Minikube ([b2c632c](https://github.com/garden-io/garden/commit/b2c632c))
* Detect circular dependencies. ([4a35276](https://github.com/garden-io/garden/commit/4a35276))
* add scan command to output info about modules in project ([075e6c2](https://github.com/garden-io/garden/commit/075e6c2))
* add support for .gardenignore file ([7ba24b7](https://github.com/garden-io/garden/commit/7ba24b7))
* add global --output flag for CLI ([7f25653](https://github.com/garden-io/garden/commit/7f25653))
* add run commands for ad-hoc runs of modules, services and tests ([3aca6ac](https://github.com/garden-io/garden/commit/3aca6ac))
* pass parent to nested log entries ([41cddf0](https://github.com/garden-io/garden/commit/41cddf0))
* add filter and find methods to logger ([814733b](https://github.com/garden-io/garden/commit/814733b))
* add login and logout commands ([00548e2](https://github.com/garden-io/garden/commit/00548e2))
* add loglevel as cli option and remove silent/verbose options ([985c160](https://github.com/garden-io/garden/commit/985c160))
* add watch flag to test and build commands ([dd0a4fe](https://github.com/garden-io/garden/commit/dd0a4fe))
* add --watch flag to deploy command ([7b11d58](https://github.com/garden-io/garden/commit/7b11d58))
* auto-rebuilding modules & FS watching ([8191aa8](https://github.com/garden-io/garden/commit/8191aa8))
* added buildContext param to buildModule handlers ([141abe9](https://github.com/garden-io/garden/commit/141abe9))
* plugins can now add modules to a project ([26f38c7](https://github.com/garden-io/garden/commit/26f38c7))
* user no longer needs to run `env config` command ([8cb6512](https://github.com/garden-io/garden/commit/8cb6512))
* **cli:** validate option flags ([8c249bd](https://github.com/garden-io/garden/commit/8c249bd))

### Performance Improvements

* made tests run quite a bit faster ([1aa69fd](https://github.com/garden-io/garden/commit/1aa69fd))

### BREAKING CHANGE


This includes some changes to the project schema and how it is resolved,
as well as how the main `Garden` class is instantiated. The `Garden`
class is now called with an environment name, which is then fixed for
the session. The env configuration is resolved by merging the specific
environment configuration with a global configuration specified on the
new `global` key in the project config. The schema for the `providers`
key also different - its keys should now match plugin names, and
contain configuration for those plugins.
