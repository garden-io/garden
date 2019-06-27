
<a name="v0.10.0"></a>
## [v0.10.0](https://github.com/garden-io/garden/compare/v0.9.12...v0.10.0) (2019-06-27)

### Bug Fixes

* always ignore .garden ([bb0e2df8](https://github.com/garden-io/garden/commit/bb0e2df8))
* update messaging when checking version ([afebab2d](https://github.com/garden-io/garden/commit/afebab2d))
* include fixes, docs and refactoring for [#778](https://github.com/garden-io/garden/issues/778) ([14063c06](https://github.com/garden-io/garden/commit/14063c06))
* crash when deploy and docker not installed ([540edb02](https://github.com/garden-io/garden/commit/540edb02))
* container entrypoint executable path should be passed as string ([80e7cf18](https://github.com/garden-io/garden/commit/80e7cf18))
* wrong base image for garden-gcloud container build ([c4d2d818](https://github.com/garden-io/garden/commit/c4d2d818))
* revisions to `command` option ([51fc76ab](https://github.com/garden-io/garden/commit/51fc76ab))
* improved error messages for call command ([2286a17e](https://github.com/garden-io/garden/commit/2286a17e))
* some commands terminate with double new line ([86fa9816](https://github.com/garden-io/garden/commit/86fa9816))
* **analytics:** don't use promises and silently fail ([85c80f24](https://github.com/garden-io/garden/commit/85c80f24))
* **cli:** don't log internal fields in error detail ([5e02c5df](https://github.com/garden-io/garden/commit/5e02c5df))
* **cli:** error log could crash if error details contained circular refs ([b6bdf870](https://github.com/garden-io/garden/commit/b6bdf870))
* **cli:** ensure cli exits with code 0 when help/version called ([3e31d9ba](https://github.com/garden-io/garden/commit/3e31d9ba))
* **container:** incorrect parsing of image ID with port in hostname ([78e03b71](https://github.com/garden-io/garden/commit/78e03b71))
* **core:** don't abort if providers needing manual init are ready ([c7becfdd](https://github.com/garden-io/garden/commit/c7becfdd))
* **core:** chokidar watcher on mac could segfault after reloading configs ([b950823c](https://github.com/garden-io/garden/commit/b950823c))
* **dashboard:** stackgraph loses ws status when drawn ([112e5825](https://github.com/garden-io/garden/commit/112e5825))
* **delete-env:** delete services before calling cleanupEnvironment ([e98485da](https://github.com/garden-io/garden/commit/e98485da))
* **dev-command:** prepareEnvironment was called twice ([65dc993b](https://github.com/garden-io/garden/commit/65dc993b))
* **install:** Add -UseBasicParsing to Windows installer ([86dacd99](https://github.com/garden-io/garden/commit/86dacd99))
* **integ-tests:** only checkout example dir when running locally ([0a1b3a2b](https://github.com/garden-io/garden/commit/0a1b3a2b))
* **k8s:** error when test+task result log exceeded 1MB ([04a5a36a](https://github.com/garden-io/garden/commit/04a5a36a))
* **k8s:** error when getting debug logs from multi-container Pods ([2778c3a8](https://github.com/garden-io/garden/commit/2778c3a8))
* **k8s:** avoid concurrency issues when creating port forwards ([169aa3c1](https://github.com/garden-io/garden/commit/169aa3c1))
* **k8s:** handle normalization issue between numbers and strings in diffs ([d98ed6fc](https://github.com/garden-io/garden/commit/d98ed6fc))
* **k8s:** handle List resources in manifests properly ([487637fc](https://github.com/garden-io/garden/commit/487637fc))
* **k8s:** make sure we error/init when any system service is missing on init ([33f9638b](https://github.com/garden-io/garden/commit/33f9638b))
* **k8s:** unreachable code when kubectl diff errors ([29ae098a](https://github.com/garden-io/garden/commit/29ae098a))
* **k8s:** unhelpful error with conflicting namespace ([a1161200](https://github.com/garden-io/garden/commit/a1161200))
* **k8s:** status checks on resources outside of app namespace would fail ([13accce4](https://github.com/garden-io/garden/commit/13accce4))
* **k8s:** startup error when using remote kubernetes provider ([b15b30f5](https://github.com/garden-io/garden/commit/b15b30f5))
* **k8s:** fix various issues with Kubernetes API queries ([c7839e93](https://github.com/garden-io/garden/commit/c7839e93))
* **k8s:** don't require manual init for local-kubernetes provider ([83d9efbb](https://github.com/garden-io/garden/commit/83d9efbb))
* **k8s:** don't store full version object with test+task results ([c4e4059d](https://github.com/garden-io/garden/commit/c4e4059d))
* **k8s:** enable publishing container modules when using remote builders ([5cfeca24](https://github.com/garden-io/garden/commit/5cfeca24))
* **k8s:** avoid normalization issue when installing nginx controller ([118b02cd](https://github.com/garden-io/garden/commit/118b02cd))
* **k8s:** fix some issues with syncing build context to remote cluster ([a5ed2cf8](https://github.com/garden-io/garden/commit/a5ed2cf8))
* **k8s:** warn instead of error when cluster services are outdated ([fbc4cb5d](https://github.com/garden-io/garden/commit/fbc4cb5d))
* **openfaas:** regression in openfaas provider init ([bca7a626](https://github.com/garden-io/garden/commit/bca7a626))
* **test:** fixed flaky test by adding sort ([8f8b0a49](https://github.com/garden-io/garden/commit/8f8b0a49))
* **vcs:** error when handling files with spaces in the name ([eeff4d46](https://github.com/garden-io/garden/commit/eeff4d46))
* **vcs:** error when stat-ing deleted file that's still in git index ([3c21ba4a](https://github.com/garden-io/garden/commit/3c21ba4a))
* **windows:** latest zeit/pkg produced broken binary for Windows ([868a0d66](https://github.com/garden-io/garden/commit/868a0d66))

### Code Refactoring

* moved default-backend image in own repo ([650f7a26](https://github.com/garden-io/garden/commit/650f7a26))
* **cli:** add header log to commands ([51c7efef](https://github.com/garden-io/garden/commit/51c7efef))
* **core:** split up plugin handler declarations to individual modules ([ea863553](https://github.com/garden-io/garden/commit/ea863553))
* **core:** allow setting a custom Garden dir path ([43f2ad69](https://github.com/garden-io/garden/commit/43f2ad69))
* **core:** added manualInit flag to prepareEnvironment handler ([66aa4739](https://github.com/garden-io/garden/commit/66aa4739))
* **k8s:** rename "local" build mode to "local-docker" ([55d9ceca](https://github.com/garden-io/garden/commit/55d9ceca))
* **k8s:** nest system garden dir under project garden dir ([33019b0a](https://github.com/garden-io/garden/commit/33019b0a))
* **k8s:** update kubernetes API library to 0.10.1 and refactor wrapper ([bd54a4e0](https://github.com/garden-io/garden/commit/bd54a4e0))

### Features

* add analytics ([#819](https://github.com/garden-io/garden/issues/819)) ([a2fa49ec](https://github.com/garden-io/garden/commit/a2fa49ec))
* implement version check ([9b077946](https://github.com/garden-io/garden/commit/9b077946))
* Implement get debug-info command ([44f666e0](https://github.com/garden-io/garden/commit/44f666e0))
* **cli:** add a dedicated options command ([8dd53003](https://github.com/garden-io/garden/commit/8dd53003))
* **config:** add local.username and project.name config keys ([8fb9b5fb](https://github.com/garden-io/garden/commit/8fb9b5fb))
* **container:** allow configuring # of replicas for container services ([ad7c973b](https://github.com/garden-io/garden/commit/ad7c973b))
* **container:** add configurable CPU and memory limits ([77e71df5](https://github.com/garden-io/garden/commit/77e71df5))
* **container:** add command option ([afbd9539](https://github.com/garden-io/garden/commit/afbd9539))
* **core:** providers can depend on and reference configs from each other ([a67f5220](https://github.com/garden-io/garden/commit/a67f5220))
* **core:** add persistent ID for each working copy ([b49ecc37](https://github.com/garden-io/garden/commit/b49ecc37))
* **core:** allow .yaml endings for Garden config files ([3a9195a0](https://github.com/garden-io/garden/commit/3a9195a0))
* **k8s:** add Kaniko as a builder option ([2ccd0395](https://github.com/garden-io/garden/commit/2ccd0395))
* **k8s:** optionally enable ingress controller for remote k8s ([6f321dcd](https://github.com/garden-io/garden/commit/6f321dcd))
* **k8s:** in-cluster building ([5d351025](https://github.com/garden-io/garden/commit/5d351025))
* **k8s:** add mechanism for cleaning up unused images in clusters ([773365c3](https://github.com/garden-io/garden/commit/773365c3))

### Improvement

* get source maps working in error tracebacks ([36959cea](https://github.com/garden-io/garden/commit/36959cea))
* **cli:** rename --loglevel to --log-level + refactor log init ([de5e78a3](https://github.com/garden-io/garden/commit/de5e78a3))
* **config:** allow non-string values to be output directly ([52ad5faf](https://github.com/garden-io/garden/commit/52ad5faf))
* **config:** allow chained conditionals in template strings ([095e9436](https://github.com/garden-io/garden/commit/095e9436))
* **config:** explicitly validate sub-paths when applicable ([6343603b](https://github.com/garden-io/garden/commit/6343603b))
* **dashboard:** add dependencies to each entity card ([8b0a4305](https://github.com/garden-io/garden/commit/8b0a4305))
* **dashboard:** add task and test info pane to overview page ([e97b8fa7](https://github.com/garden-io/garden/commit/e97b8fa7))
* **dashboard:** add graph filters to global context ([73e3f5ca](https://github.com/garden-io/garden/commit/73e3f5ca))
* **dashboard:** view ingress on lg screens instead of xl ([bd28965e](https://github.com/garden-io/garden/commit/bd28965e))
* **install:** add install script for linux/mac and update docs ([dbeb7544](https://github.com/garden-io/garden/commit/dbeb7544))
* **k8s:** always require manual init for remote clusters ([4201dc53](https://github.com/garden-io/garden/commit/4201dc53))
* **k8s:** add explicit cluster-init command for remote clusters ([0a70a068](https://github.com/garden-io/garden/commit/0a70a068))
* **k8s:** don't require manual init when only Tiller is missing ([693189b4](https://github.com/garden-io/garden/commit/693189b4))
* **k8s:** more robust and useful deployment status checks ([4f1ff3be](https://github.com/garden-io/garden/commit/4f1ff3be))
* **k8s:** bump default limits and sizes for cluster builder ([6ec9f0a7](https://github.com/garden-io/garden/commit/6ec9f0a7))
* **plugins:** define schemas for module outputs and add docs ([5f656ac2](https://github.com/garden-io/garden/commit/5f656ac2))
* **service:** add project root to config dump ([520aadf3](https://github.com/garden-io/garden/commit/520aadf3))
* **windows:** check for Hyper-V and ask if user wants Docker ([21024f82](https://github.com/garden-io/garden/commit/21024f82))

### Performance Improvements

* improve performance of logs command ([65afeef8](https://github.com/garden-io/garden/commit/65afeef8))

### BREAKING CHANGE


k8s providers no longer default to `/bin/sh -c` as the entrypoint when
running pods. This applies to tasks, tests and the `run module` command.

The --loglevel CLI option is now called --log-level

When using OpenFaaS with `local-kubernetes` you now need to use the
`local-openfaas` provider, instead of `openfaas`. You also need to
manually delete any existing `<my namespace>--openfaas` namespaces from your
cluster after upgrading.


<a name="v0.9.12"></a>
## [v0.9.12](https://github.com/garden-io/garden/compare/v0.9.11...v0.9.12) (2019-05-21)

### Bug Fixes

* make global CLI opts available to commands ([70bce731](https://github.com/garden-io/garden/commit/70bce731))
* build deps not watched when using -w flag ([36e8c67b](https://github.com/garden-io/garden/commit/36e8c67b))
* **config:** recursion error with invalid template strings ([0cbcb988](https://github.com/garden-io/garden/commit/0cbcb988))
* **config:** validation fix for template strings ([961dd707](https://github.com/garden-io/garden/commit/961dd707))
* **dashboard:** add taskError event + small ui tweaks ([d308b89c](https://github.com/garden-io/garden/commit/d308b89c))
* **docs:** update the path to run garden-debug ([0df0e849](https://github.com/garden-io/garden/commit/0df0e849))
* **k8s:** use correct container handlers when building modules ([e150a990](https://github.com/garden-io/garden/commit/e150a990))
* **k8s:** ensure env is prepared ([c2cd689d](https://github.com/garden-io/garden/commit/c2cd689d))
* **k8s:** helm modules weren't identified as hot reloadable ([0b7ce98e](https://github.com/garden-io/garden/commit/0b7ce98e))
* **k8s:** fix type error when Kubernetes is not running ([412fe573](https://github.com/garden-io/garden/commit/412fe573))
* **k8s:** ensure test results get stored if test fails ([7ec1bae8](https://github.com/garden-io/garden/commit/7ec1bae8))
* **logger:** fix spinner pos ([12d0dd4b](https://github.com/garden-io/garden/commit/12d0dd4b))
* **logger:** add info symbol to active basic entries ([08bb5945](https://github.com/garden-io/garden/commit/08bb5945))

### Code Refactoring

* **core:** tighten config validation and clean up some cruft ([39fb3125](https://github.com/garden-io/garden/commit/39fb3125))
* **core:** fold push task into build task ([733e2dbc](https://github.com/garden-io/garden/commit/733e2dbc))
* **dashboard:** use useReducer in useApi hook ([8bc67d0b](https://github.com/garden-io/garden/commit/8bc67d0b))
* **dashboard:** remove LoadWrapper ([29ddc83b](https://github.com/garden-io/garden/commit/29ddc83b))
* **dashboard:** use a single generic node info container ([09d3d58c](https://github.com/garden-io/garden/commit/09d3d58c))

### Features

* add test/task statuses to get status command ([a1e2122b](https://github.com/garden-io/garden/commit/a1e2122b))
* render results as JSON for json logger ([4ca179e6](https://github.com/garden-io/garden/commit/4ca179e6))
* **dashboard:** overall dashboard improvements ([253316f2](https://github.com/garden-io/garden/commit/253316f2))
* **dashboard:** implement new overview page ([d3ae347f](https://github.com/garden-io/garden/commit/d3ae347f))

### Improvement

* font sizes and header ([55f7d961](https://github.com/garden-io/garden/commit/55f7d961))
* **commands:** added task/test fields to get-status response ([1f34f294](https://github.com/garden-io/garden/commit/1f34f294))
* **dashboard:** fix ui issues ([488369ec](https://github.com/garden-io/garden/commit/488369ec))
* **dashboard:** start dashboard before init and keep same port ([e3bc9ee1](https://github.com/garden-io/garden/commit/e3bc9ee1))
* **task-graph:** raise concurrency limit ([a6343d51](https://github.com/garden-io/garden/commit/a6343d51))

### BREAKING CHANGE


This removes the previously deprecated ability to do nested formatting
strings. It's not a helpful feature for most cases, and just complicates
the parser logic. Also wasn't documented really, so it should be safe to
remove without a minor version bump.


<a name="v0.9.11"></a>
## [v0.9.11](https://github.com/garden-io/garden/compare/v0.9.10...v0.9.11) (2019-04-29)

### Bug Fixes

* **core:** set name prefix on plugin services, tasks and tests ([81b8d581](https://github.com/garden-io/garden/commit/81b8d581))
* **k8s:** allow unknown fields in provider config ([921243df](https://github.com/garden-io/garden/commit/921243df))
* **k8s:** avoid repeated Tiller install causing slower init ([766ef188](https://github.com/garden-io/garden/commit/766ef188))
* **k8s:** use statuscodeerror type when using request-promise ([e61fe337](https://github.com/garden-io/garden/commit/e61fe337))
* **task-graph:** ensure graph node keys and event payload keys match ([47e84b4c](https://github.com/garden-io/garden/commit/47e84b4c))
* **vcs:** don't fork a process for every untracked file ([ef439923](https://github.com/garden-io/garden/commit/ef439923))

### Code Refactoring

* rename task baseKey to key and key to id ([f7cecce7](https://github.com/garden-io/garden/commit/f7cecce7))
* **k8s:** move some things around + remove need for login ([e0543ad6](https://github.com/garden-io/garden/commit/e0543ad6))

### Features

* **dashboard:** add 'more info' pane to stack graph ([bee72e65](https://github.com/garden-io/garden/commit/bee72e65))

### Improvement

* **k8s:** better status checks ([615c02aa](https://github.com/garden-io/garden/commit/615c02aa))
* **tasks:** minor logging improvements ([18e04859](https://github.com/garden-io/garden/commit/18e04859))


<a name="v0.9.10"></a>
## [v0.9.10](https://github.com/garden-io/garden/compare/v0.9.9...v0.9.10) (2019-04-19)

### Bug Fixes

* **cli:** detect missing services in --hot option ([9209ac43](https://github.com/garden-io/garden/commit/9209ac43))
* **k8s:** deduplicate ns creation during init ([316f9a67](https://github.com/garden-io/garden/commit/316f9a67))
* **k8s:** allow multiple paths in KUBECONFIG env var ([9cc6130d](https://github.com/garden-io/garden/commit/9cc6130d))

### Features

* **cli:** allow --hot=* in dev/deploy commands ([15db6edd](https://github.com/garden-io/garden/commit/15db6edd))
* **dashboard:** added taskProcessing state ([10bc2759](https://github.com/garden-io/garden/commit/10bc2759))
* **k8s:** add microk8s support ([e113c697](https://github.com/garden-io/garden/commit/e113c697))
* **k8s:** automatically fetch kubectl when needed ([d79f7a44](https://github.com/garden-io/garden/commit/d79f7a44))


<a name="v0.9.9"></a>
## [v0.9.9](https://github.com/garden-io/garden/compare/v0.9.8...v0.9.9) (2019-04-11)

### Bug Fixes

* **config-graph:** remove superfluous data from rendered graph nodes ([fa0d8204](https://github.com/garden-io/garden/commit/fa0d8204))
* **vcs:** fixed path handling for modified files ([ec82c220](https://github.com/garden-io/garden/commit/ec82c220))
* **vcs:** handle case when file is removed while listing VCS files ([7aeec2fa](https://github.com/garden-io/garden/commit/7aeec2fa))
* **vcs:** exclude .garden from version hashing ([0dc12082](https://github.com/garden-io/garden/commit/0dc12082))

### Improvement

* **config-graph:** add more data to rendered graph nodes ([05f32c33](https://github.com/garden-io/garden/commit/05f32c33))


<a name="v0.9.8"></a>
## [v0.9.8](https://github.com/garden-io/garden/compare/v0.9.7...v0.9.8) (2019-04-08)

### Bug Fixes

* **cli:** avoid crash with circular references in error details ([92b31c09](https://github.com/garden-io/garden/commit/92b31c09))
* **config:** issue with nested keys in conditional template strings ([35ad3df9](https://github.com/garden-io/garden/commit/35ad3df9))
* **config:** catch module self-references instead of crashing ([2fb87204](https://github.com/garden-io/garden/commit/2fb87204))
* **k8s:** skip kubectl diff for container type ([8dfb6a7b](https://github.com/garden-io/garden/commit/8dfb6a7b))
* **run:** correctly ignore task dependencies ([e51778b8](https://github.com/garden-io/garden/commit/e51778b8))

### Code Refactoring

* add ui state provider ([dd36a0e6](https://github.com/garden-io/garden/commit/dd36a0e6))
* **graph:** make sure all tasks are included in process results ([91afd59a](https://github.com/garden-io/garden/commit/91afd59a))

### Features

* **config:** add var alias for variables template key ([ede49e5d](https://github.com/garden-io/garden/commit/ede49e5d))
* **core:** add module include field and use content hash for versions ([8bd0b5bb](https://github.com/garden-io/garden/commit/8bd0b5bb))

### Improvement

* **k8s:** store test results cluster-wide ([61ea396a](https://github.com/garden-io/garden/commit/61ea396a))


<a name="v0.9.7"></a>
## [v0.9.7](https://github.com/garden-io/garden/compare/v0.9.6...v0.9.7) (2019-03-28)

### Bug Fixes

* include resolved config in module version ([31b2936f](https://github.com/garden-io/garden/commit/31b2936f))
* ensure CLI returns correct exit code ([#626](https://github.com/garden-io/garden/issues/626)) ([eeb069f9](https://github.com/garden-io/garden/commit/eeb069f9))
* whitespaces instead of dots in terminal ([f6445c76](https://github.com/garden-io/garden/commit/f6445c76))
* **dashboard:** awkward name for task nodes in Stack Graph ([616c8b52](https://github.com/garden-io/garden/commit/616c8b52))
* **dashboard:** graph ui fixes ([60c746e9](https://github.com/garden-io/garden/commit/60c746e9))
* **k8s:** handle logs properly for all module types and resources ([56a15ba9](https://github.com/garden-io/garden/commit/56a15ba9))
* **k8s:** report correct deployment status when replicas=0 ([a7a29838](https://github.com/garden-io/garden/commit/a7a29838))

### Features

* **k8s:** add kubernetes module type ([1488cd82](https://github.com/garden-io/garden/commit/1488cd82))

### Improvement

* **container:** check for Docker version on first use ([b898c403](https://github.com/garden-io/garden/commit/b898c403))


<a name="v0.9.6"></a>
## [v0.9.6](https://github.com/garden-io/garden/compare/v0.9.5...v0.9.6) (2019-03-25)

### Bug Fixes

* use unique names for a service's ingresses ([b1fbb255](https://github.com/garden-io/garden/commit/b1fbb255))
* set correct jdk target path ([29874e1d](https://github.com/garden-io/garden/commit/29874e1d))
* fixed vulnerabilities identified by Snyk ([bc79d26e](https://github.com/garden-io/garden/commit/bc79d26e))
* **build:** remove deleted files/dirs during sync ([96301928](https://github.com/garden-io/garden/commit/96301928))
* **build:** don't delete when syncing dependencies ([a5e12a7e](https://github.com/garden-io/garden/commit/a5e12a7e))
* **container:** wrong image ID when deploying external image locally ([a12682cf](https://github.com/garden-io/garden/commit/a12682cf))
* **container:** further issues with deployment image IDs ([5230408a](https://github.com/garden-io/garden/commit/5230408a))
* **core:** generated files were sometimes deleted between build and run ([dcfb7e10](https://github.com/garden-io/garden/commit/dcfb7e10))
* **core:** missing detail in error.log for non-Garden exceptions ([7a0265d3](https://github.com/garden-io/garden/commit/7a0265d3))
* **integ-tests:** helper to remove .garden dirs ([77abbe34](https://github.com/garden-io/garden/commit/77abbe34))
* **k8s:** validation error on maven-container modules ([3c41c8e1](https://github.com/garden-io/garden/commit/3c41c8e1))
* **k8s:** regression in remote K8s init flow ([77fb9fa5](https://github.com/garden-io/garden/commit/77fb9fa5))
* **k8s:** work around issue with Istio sidecars and ad-hoc pod runs ([f8d5b449](https://github.com/garden-io/garden/commit/f8d5b449))
* **k8s:** issues with remote cluster deployments ([982e6e24](https://github.com/garden-io/garden/commit/982e6e24))
* **k8s:** error when initializing remote kubernetes provider ([27cf2b5c](https://github.com/garden-io/garden/commit/27cf2b5c))
* **maven-container:** work around issue with concurrent builds in mvn ([4bd9b8bb](https://github.com/garden-io/garden/commit/4bd9b8bb))
* **maven-container:** incorrect JAR_PATH build argument ([bd66bb55](https://github.com/garden-io/garden/commit/bd66bb55))
* **maven-container:** always copy Dockerfile to build dir before build ([fada240f](https://github.com/garden-io/garden/commit/fada240f))

### Code Refactoring

* split provider from KubeApi ([4787e513](https://github.com/garden-io/garden/commit/4787e513))

### Features

* **config:** support simple OR statements in template strings ([312e90bf](https://github.com/garden-io/garden/commit/312e90bf))
* **k8s:** cache task results ([5769aeb1](https://github.com/garden-io/garden/commit/5769aeb1))
* **maven-container:** explicity support in K8s provider ([592bf942](https://github.com/garden-io/garden/commit/592bf942))
* **maven-container:** add mvnOpts field and remove default option ([187dc7d9](https://github.com/garden-io/garden/commit/187dc7d9))
* **maven-container:** automatically fetch Maven and OpenJDK ([5045cd34](https://github.com/garden-io/garden/commit/5045cd34))

### Improvement

* **k8s:** better deployment status checking ([d84c97e4](https://github.com/garden-io/garden/commit/d84c97e4))
* **k8s:** don't require username input when namespace is set ([d61290ac](https://github.com/garden-io/garden/commit/d61290ac))
* **k8s:** more granular status message while deploying ([c2c70609](https://github.com/garden-io/garden/commit/c2c70609))


<a name="v0.9.5"></a>
## [v0.9.5](https://github.com/garden-io/garden/compare/v0.9.4...v0.9.5) (2019-03-12)

### Bug Fixes

* increase init delay for liveness probe ([e2a1e875](https://github.com/garden-io/garden/commit/e2a1e875))
* occasional concurrency issue when fetching external tools ([9d61d711](https://github.com/garden-io/garden/commit/9d61d711))
* use abs target paths in HR copy commands ([94619f61](https://github.com/garden-io/garden/commit/94619f61))
* include container name in pod log requests ([247272d4](https://github.com/garden-io/garden/commit/247272d4))
* add tasks for all affected modules on watch ([badb2b22](https://github.com/garden-io/garden/commit/badb2b22))
* respect level when using logger type env var ([c5a5d6b5](https://github.com/garden-io/garden/commit/c5a5d6b5))
* stream container build output and cap max buffer size ([2a885c88](https://github.com/garden-io/garden/commit/2a885c88))
* make sure to log build task success ([d0c896a8](https://github.com/garden-io/garden/commit/d0c896a8))
* **build:** always sync sources when building ([874e23ce](https://github.com/garden-io/garden/commit/874e23ce))
* **cli:** log test duration in CLI output ([61a0e404](https://github.com/garden-io/garden/commit/61a0e404))
* **container:** error when getting status ahead of building ([6c4b0b4d](https://github.com/garden-io/garden/commit/6c4b0b4d))
* **container:** handle image IDs with multi-level namespace ([342b987e](https://github.com/garden-io/garden/commit/342b987e))
* **container:** use configured image ID locally ([bf5d4289](https://github.com/garden-io/garden/commit/bf5d4289))
* **dashboard:** fix undefined color ([a0f0b438](https://github.com/garden-io/garden/commit/a0f0b438))
* **examples:** use different ingress hostnames for vote-helm example ([e4ad8132](https://github.com/garden-io/garden/commit/e4ad8132))
* **k8s:** handle CRDs properly ([73f48bf6](https://github.com/garden-io/garden/commit/73f48bf6))
* **openfaas:** error when getting status of func not created by Garden ([d7da0893](https://github.com/garden-io/garden/commit/d7da0893))
* **openfaas:** update faas-cli to 0.8.3 ([7915008b](https://github.com/garden-io/garden/commit/7915008b))

### Features

* add maven-container plugin type ([74148980](https://github.com/garden-io/garden/commit/74148980))
* **container:** add env field to task spec ([950536f0](https://github.com/garden-io/garden/commit/950536f0))

### Improvement

* **k8s:** better logging while deploying services ([4cd5d053](https://github.com/garden-io/garden/commit/4cd5d053))
* **k8s:** update helm to v2.13.0 ([0685a9b7](https://github.com/garden-io/garden/commit/0685a9b7))


<a name="v0.9.4"></a>
## [v0.9.4](https://github.com/garden-io/garden/compare/v0.9.3...v0.9.4) (2019-03-04)

### Bug Fixes

* ensure module is up to date in watch handler ([44e88712](https://github.com/garden-io/garden/commit/44e88712))


<a name="v0.9.3"></a>
## [v0.9.3](https://github.com/garden-io/garden/compare/v0.9.2...v0.9.3) (2019-03-01)

### Bug Fixes

* allow ingress annotations in service status ([fac31935](https://github.com/garden-io/garden/commit/fac31935))
* openfaas plugin bug ([d7cf528e](https://github.com/garden-io/garden/commit/d7cf528e))
* **k8s:** don't abort deployment on FailedMount warning ([90ac36c1](https://github.com/garden-io/garden/commit/90ac36c1))
* **vcs:** untracked files didn't update version timestamp correctly ([3b85c350](https://github.com/garden-io/garden/commit/3b85c350))

### Features

* **cli:** print ingress endpoints after deploying ([b7961ec8](https://github.com/garden-io/garden/commit/b7961ec8))
* **container:** add `build.targetImage` parameter ([9bf6aa13](https://github.com/garden-io/garden/commit/9bf6aa13))
* **k8s:** support service and ingress annotations on container module ([894bd1f6](https://github.com/garden-io/garden/commit/894bd1f6))


<a name="v0.9.2"></a>
## [v0.9.2](https://github.com/garden-io/garden/compare/v0.9.1...v0.9.2) (2019-02-22)

### Bug Fixes

* fixed bug in configuring flat-config modules ([fd5bed86](https://github.com/garden-io/garden/commit/fd5bed86))
* don't emit taskPending if task is skipped ([74e2c5d8](https://github.com/garden-io/garden/commit/74e2c5d8))
* clean up field usage in example projects ([7ed2da35](https://github.com/garden-io/garden/commit/7ed2da35))
* **helm:** filter out test pods when deploying charts ([b6462360](https://github.com/garden-io/garden/commit/b6462360))
* **helm:** allow duplicate keys in template ([51538570](https://github.com/garden-io/garden/commit/51538570))
* **k8s:** kubernetes dashboard wasn't showing up in dashboard ([2b76841d](https://github.com/garden-io/garden/commit/2b76841d))
* **k8s:** fix RBAC issues with kubernetes-dashboard on minikube ([291f3687](https://github.com/garden-io/garden/commit/291f3687))
* **k8s:** don't use --wait when installing using Helm ([02cd157a](https://github.com/garden-io/garden/commit/02cd157a))
* **k8s:** don't error on pod scheduling warning ([49f81157](https://github.com/garden-io/garden/commit/49f81157))
* **local-k8s:** always use force flag when deploying to garden-system ns ([6cbe0643](https://github.com/garden-io/garden/commit/6cbe0643))
* **local-k8s:** remove hardcoded ingress class ([9eb60520](https://github.com/garden-io/garden/commit/9eb60520))
* **local-k8s:** don't install nginx when running with Minikube ([056924b9](https://github.com/garden-io/garden/commit/056924b9))
* **templates:** add prefix to versionString ([fe9cd49c](https://github.com/garden-io/garden/commit/fe9cd49c))

### Features

* add support for flat config style ([fecde8bf](https://github.com/garden-io/garden/commit/fecde8bf))
* allow multiple modules in a single file ([ff4d3702](https://github.com/garden-io/garden/commit/ff4d3702))
* don't restart command when config is invalid ([2a534b12](https://github.com/garden-io/garden/commit/2a534b12))


<a name="v0.9.1"></a>
## [v0.9.1](https://github.com/garden-io/garden/compare/v0.9.0...v0.9.1) (2019-02-12)

### Bug Fixes

* **dashboard:** set min select width ([06386bfb](https://github.com/garden-io/garden/commit/06386bfb))
* **server:** serve dashboard from all dashboard routes ([5abf580c](https://github.com/garden-io/garden/commit/5abf580c))

### Features

* **dashboard:** update font colour ([dccbf877](https://github.com/garden-io/garden/commit/dccbf877))
* **dashboard:** conform colours to style guide ([44b54e0e](https://github.com/garden-io/garden/commit/44b54e0e))
* **dashboard:** ui improvments ([4d38659c](https://github.com/garden-io/garden/commit/4d38659c))
* **dashboard:** enable by default ([574f56d6](https://github.com/garden-io/garden/commit/574f56d6))


<a name="v0.9.0"></a>
## [v0.9.0](https://github.com/garden-io/garden/compare/v0.8.1...v0.9.0) (2019-02-08)

### Bug Fixes

* improved error messages when deps are missing ([#484](https://github.com/garden-io/garden/issues/484)) ([c5e6dceb](https://github.com/garden-io/garden/commit/c5e6dceb))
* add path to module validation error messages ([b1c54b07](https://github.com/garden-io/garden/commit/b1c54b07))
* delete outdated system namespaces ([cda0c7c1](https://github.com/garden-io/garden/commit/cda0c7c1))
* add missing package to garden-service/package.json ([4688e56f](https://github.com/garden-io/garden/commit/4688e56f))
* don't watch project-level log files ([81c8d04d](https://github.com/garden-io/garden/commit/81c8d04d))
* **core:** error in actions.getStatus helper ([a4cf625e](https://github.com/garden-io/garden/commit/a4cf625e))
* **core:** missing module configs in dumpConfig response ([c8609a28](https://github.com/garden-io/garden/commit/c8609a28))
* **core:** using module version in templates didn't work with watch ([6c209af8](https://github.com/garden-io/garden/commit/6c209af8))
* **core:** certain template strings could not be resolved in configs ([3d582c42](https://github.com/garden-io/garden/commit/3d582c42))
* **dashboard:** conform to new "get config" response ([bfa2c0fd](https://github.com/garden-io/garden/commit/bfa2c0fd))
* **dashboard:** handle empty ingress in service status ([870d5f30](https://github.com/garden-io/garden/commit/870d5f30))
* **dashboard:** limit number of log lines that are fetched ([#461](https://github.com/garden-io/garden/issues/461)) ([3c214cef](https://github.com/garden-io/garden/commit/3c214cef))
* **deploy:** make watch parameter implicit when hot-reloading ([0819605c](https://github.com/garden-io/garden/commit/0819605c))
* **exec:** missing tasks key in module schema ([cc13f33c](https://github.com/garden-io/garden/commit/cc13f33c))
* **get-tasks:** print msg if no tasks found ([f64d59cf](https://github.com/garden-io/garden/commit/f64d59cf))
* **k8s:** configure RBAC properly for Tiller ([d1829299](https://github.com/garden-io/garden/commit/d1829299))
* **k8s:** fix issue with log following for K8s ([6624964d](https://github.com/garden-io/garden/commit/6624964d))
* **k8s:** incorrect role binding for tiller service account ([9a61840b](https://github.com/garden-io/garden/commit/9a61840b))
* **logger:** only inherit parent level if option is set ([#493](https://github.com/garden-io/garden/issues/493)) ([99fdb12c](https://github.com/garden-io/garden/commit/99fdb12c))
* **openfaas:** override release name to avoid conflict across namespaces ([2eea9bd0](https://github.com/garden-io/garden/commit/2eea9bd0))
* **perf:** reuse port-forwards when hot-reloading ([6db83a78](https://github.com/garden-io/garden/commit/6db83a78))
* **server:** ensure log entries have level silly ([#496](https://github.com/garden-io/garden/issues/496)) ([5b11322b](https://github.com/garden-io/garden/commit/5b11322b))
* **status:** return more correct/granular statuses ([d4a7cf27](https://github.com/garden-io/garden/commit/d4a7cf27))

### Code Refactoring

* add configureProvider plugin action ([bdf69944](https://github.com/garden-io/garden/commit/bdf69944))
* rename `generic` plugin to `exec` ([4c85d46d](https://github.com/garden-io/garden/commit/4c85d46d))
* use events for file watching instead of callbacks ([f6a99c2f](https://github.com/garden-io/garden/commit/f6a99c2f))
* rename `validate` module action to `configure` ([7b02fdd9](https://github.com/garden-io/garden/commit/7b02fdd9))
* allow consecutive dashes in identifier regex ([37fe9c37](https://github.com/garden-io/garden/commit/37fe9c37))
* remove experimental Go CLI ([e9ef3aac](https://github.com/garden-io/garden/commit/e9ef3aac))
* **commands:** remove create commands ([88d18d8c](https://github.com/garden-io/garden/commit/88d18d8c))
* **dashboard:** use React Hooks API for state management ([588dd6c6](https://github.com/garden-io/garden/commit/588dd6c6))
* **dashboard:** rename root dir to dashboard ([6b484305](https://github.com/garden-io/garden/commit/6b484305))
* **go-cli:** replace unison with mutagen (wip) ([b7a0d339](https://github.com/garden-io/garden/commit/b7a0d339))
* **k8s:** minor change to speed up container deploys ([91da1021](https://github.com/garden-io/garden/commit/91da1021))
* **k8s:** shorten default namespace names ([15aa5ded](https://github.com/garden-io/garden/commit/15aa5ded))
* **logger:** remove root prop from LogNode class ([b1e8fa61](https://github.com/garden-io/garden/commit/b1e8fa61))
* **logger:** rename preserveLevel opt to childEntriesInheritLevel ([0b3efabb](https://github.com/garden-io/garden/commit/0b3efabb))

### Features

* rename command to args for container type ([84f5a8d3](https://github.com/garden-io/garden/commit/84f5a8d3))
* added get tasks command ([250315d3](https://github.com/garden-io/garden/commit/250315d3))
* add servicePort config option ([57b23f35](https://github.com/garden-io/garden/commit/57b23f35))
* **cli:** add --hot alias for --hot-reload flag ([22ac4f6c](https://github.com/garden-io/garden/commit/22ac4f6c))
* **dashboard:** update UI (closes [#460](https://github.com/garden-io/garden/issues/460)) ([e59897c9](https://github.com/garden-io/garden/commit/e59897c9))
* **dashboard:** expose provider links in sidebar ([48c9e131](https://github.com/garden-io/garden/commit/48c9e131))
* **k8s:** add Helm module inheritance via the `base` field ([8a7a7e57](https://github.com/garden-io/garden/commit/8a7a7e57))
* **k8s:** proper support for Helm charts ([48f03759](https://github.com/garden-io/garden/commit/48f03759))
* **k8s:** make hot reloading work for remote clusters ([7ca3dc34](https://github.com/garden-io/garden/commit/7ca3dc34))
* **k8s:** allow overriding release name in Helm modules ([1530105d](https://github.com/garden-io/garden/commit/1530105d))
* **k8s:** allow disabling nginx setup in local-kubernetes provider ([33511bc8](https://github.com/garden-io/garden/commit/33511bc8))
* **logger:** allow controlling level with env var ([#452](https://github.com/garden-io/garden/issues/452)) ([ec8bd45b](https://github.com/garden-io/garden/commit/ec8bd45b))
* **versioncmd:** add version command ([8be47617](https://github.com/garden-io/garden/commit/8be47617))

### BREAKING CHANGE


Module configurations using the `services` template key need to be
updated to use `modules` instead.

The (admittedly poorly supported) google-cloud-function module type has
been changed to include only one function per module. This is more
consistent with other module types, and avoids complex refactoring
to fit with the changes in the templating context.

After this, the `create project` and `create module` commands will no
longer be available. We're removing them for now because currently
they're more confusing than they are useful. There's an open Github

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


<a name="v0.8.1"></a>
## [v0.8.1](https://github.com/garden-io/garden/compare/v0.8.0...v0.8.1) (2018-12-10)

### Bug Fixes

* minor logging issue ([61e44285](https://github.com/garden-io/garden/commit/61e44285))
* make dev cmd consistent with deploy cmd ([85f31f94](https://github.com/garden-io/garden/commit/85f31f94))
* fixed dependency bug & simplified TaskGraph ([4a8428ce](https://github.com/garden-io/garden/commit/4a8428ce))
* fixed another dependency calculation bug ([99df5d9f](https://github.com/garden-io/garden/commit/99df5d9f))
* performance regression on startup ([b856e364](https://github.com/garden-io/garden/commit/b856e364))
* do not run dependant tasks unless updated services depend on them ([1ae02847](https://github.com/garden-io/garden/commit/1ae02847))
* stale version in some tasks triggered by watch handler ([da134b46](https://github.com/garden-io/garden/commit/da134b46))
* fix dev command terminating on config change ([261e9748](https://github.com/garden-io/garden/commit/261e9748))
* **dashboard:** fix contants import in setupProxy.js ([e2c5bbd0](https://github.com/garden-io/garden/commit/e2c5bbd0))
* **k8s:** exec and run commands didn't work properly in interactive mode ([420953da](https://github.com/garden-io/garden/commit/420953da))
* **k8s:** revert removal of `-i` flag on kubectl run commands ([663deea3](https://github.com/garden-io/garden/commit/663deea3))
* **k8s:** log tailing now returns logs for new pods at runtime ([432e6dce](https://github.com/garden-io/garden/commit/432e6dce))
* **k8s:** remove replicasets and daemonsets when deleting services ([6c633140](https://github.com/garden-io/garden/commit/6c633140))
* **k8s:** incorrect flags sent to `kubectl run` when not interactive ([260b9763](https://github.com/garden-io/garden/commit/260b9763))
* **log:** log footer line was duplicated after config reload ([a8b50b1e](https://github.com/garden-io/garden/commit/a8b50b1e))
* **tasks:** task errors had lost their color ([66390e12](https://github.com/garden-io/garden/commit/66390e12))

### Code Refactoring

* nicer logging when watching for changes / hot reloading ([069a9d0b](https://github.com/garden-io/garden/commit/069a9d0b))
* rename plural command parameters ([f010e370](https://github.com/garden-io/garden/commit/f010e370))
* add placeholder method to logger + fix rendering issues ([fa8d81eb](https://github.com/garden-io/garden/commit/fa8d81eb))
* rename logEntry to log and require for tests, cmds and actions ([13cf263c](https://github.com/garden-io/garden/commit/13cf263c))
* **formatting:** improve quoting style of objects to consistent-as-needed ([687c6f3c](https://github.com/garden-io/garden/commit/687c6f3c))
* **task-graph:** add task key to TaskResult interface ([3ce66337](https://github.com/garden-io/garden/commit/3ce66337))

### Features

* add `get config` command ([39ab7b16](https://github.com/garden-io/garden/commit/39ab7b16))
* added get graph command ([010353e6](https://github.com/garden-io/garden/commit/010353e6))
* experimental HTTP API ([53028020](https://github.com/garden-io/garden/commit/53028020))
* add websocket endpoint to API server ([e6fcc8bf](https://github.com/garden-io/garden/commit/e6fcc8bf))
* add event bus + a few events emitted from TaskGraph ([3c19e369](https://github.com/garden-io/garden/commit/3c19e369))
* allow plugins to specify dashboard pages ([c67b7bec](https://github.com/garden-io/garden/commit/c67b7bec))
* **api:** allow explicitly port for api server in dev cmd ([919e6b8a](https://github.com/garden-io/garden/commit/919e6b8a))
* **dashboard:** add basic scaffolding with overview and logs section ([3781fb3e](https://github.com/garden-io/garden/commit/3781fb3e))
* **openfaas:** add log streaming to openfaas plugin ([53131b5e](https://github.com/garden-io/garden/commit/53131b5e))


<a name="v0.8.0"></a>
## [v0.8.0](https://github.com/garden-io/garden/compare/v0.7.0...v0.8.0) (2018-11-21)

### Bug Fixes

* handle missing services gracefully in logs command ([3fcb73f8](https://github.com/garden-io/garden/commit/3fcb73f8))
* use plugin-prefixed module names in dep calcs ([7f65c9ac](https://github.com/garden-io/garden/commit/7f65c9ac))
* use faas-cli to delete OpenFAAS services ([b38113ea](https://github.com/garden-io/garden/commit/b38113ea))
* allow env variables to be lower case ([b79609c9](https://github.com/garden-io/garden/commit/b79609c9))
* fixes to hot reload source/target handling ([271917b6](https://github.com/garden-io/garden/commit/271917b6))
* recursive bug copying .garden into .garden ([78559828](https://github.com/garden-io/garden/commit/78559828))
* skip build task during hot-reloading ([5e247160](https://github.com/garden-io/garden/commit/5e247160))
* set log state to success after deleting env ([19ef0387](https://github.com/garden-io/garden/commit/19ef0387))
* fix broken doc links ([4a96f4ca](https://github.com/garden-io/garden/commit/4a96f4ca))
* handle all promises and add no-floating-promises linting rule ([f0b41048](https://github.com/garden-io/garden/commit/f0b41048))
* replace node-pty with node-pty-prebuilt to avoid install issues ([775c98f0](https://github.com/garden-io/garden/commit/775c98f0))
* include provided deps in module cache keys ([b6652d0d](https://github.com/garden-io/garden/commit/b6652d0d))
* prevent multiple prefixing in getModuleKey ([2421223a](https://github.com/garden-io/garden/commit/2421223a))
* incomplete downloads in ext-tool helper ([30a6eb0a](https://github.com/garden-io/garden/commit/30a6eb0a))
* ignore paths relative to parent dir when scanning modules ([65ba584d](https://github.com/garden-io/garden/commit/65ba584d))
* add missing parenthesis to windows install script ([850f2d43](https://github.com/garden-io/garden/commit/850f2d43))
* issues with ext tool helper ([641a07cc](https://github.com/garden-io/garden/commit/641a07cc))
* docs, comments & various fixes ([2d081a0d](https://github.com/garden-io/garden/commit/2d081a0d))
* incl. ingresses & services in delete command. ([8d3f366f](https://github.com/garden-io/garden/commit/8d3f366f))
* **cli:** change magenta to cyan in cli help text ([#281](https://github.com/garden-io/garden/issues/281)) ([1580d1b0](https://github.com/garden-io/garden/commit/1580d1b0))
* **create-command:** add project key to generated config and fix tests ([63cca8f1](https://github.com/garden-io/garden/commit/63cca8f1))
* **docs:** tweaks to config file reference docs ([de5e4a58](https://github.com/garden-io/garden/commit/de5e4a58))
* **examples:** remove local npm dependency in hello-world example ([d91327e9](https://github.com/garden-io/garden/commit/d91327e9))
* **ext-tools:** handle end of stream event ([1a36b720](https://github.com/garden-io/garden/commit/1a36b720))
* **git:** error when running before first commit is made in repo ([#324](https://github.com/garden-io/garden/issues/324)) ([7dd77ae4](https://github.com/garden-io/garden/commit/7dd77ae4))
* **k8s:** fix status check for our K8s deployments ([35187d34](https://github.com/garden-io/garden/commit/35187d34))
* **k8s:** make sure Helm client is initialized on startup ([f1bf4bdc](https://github.com/garden-io/garden/commit/f1bf4bdc))
* **k8s:** attempt to fix issues with helm release upgrades ([4ec63b72](https://github.com/garden-io/garden/commit/4ec63b72))
* **k8s:** don't throw if api returns 404 when checking object status ([23dc9356](https://github.com/garden-io/garden/commit/23dc9356))
* **logger:** only print emoji if env supports it ([3e541e14](https://github.com/garden-io/garden/commit/3e541e14))
* **logger:** let empty entries inherit parent indentation level ([9c428cda](https://github.com/garden-io/garden/commit/9c428cda))
* **logger:** appended error messages now rendered properly ([f964b3bf](https://github.com/garden-io/garden/commit/f964b3bf))
* **logger:** render non-empty entries even though msg is missing ([20f28308](https://github.com/garden-io/garden/commit/20f28308))
* **openfaas:** fix issues with openfaas builds ([f62db2f1](https://github.com/garden-io/garden/commit/f62db2f1))
* **openfaas:** avoid length issue for helm release name ([ad0e708e](https://github.com/garden-io/garden/commit/ad0e708e))
* **openfaas:** fix cleanupEnvironment handler ([b080d55d](https://github.com/garden-io/garden/commit/b080d55d))
* **openfaas:** builder now works on all platforms ([529f63c9](https://github.com/garden-io/garden/commit/529f63c9))
* **scripts:** Add jq dependancy ([29da4e2e](https://github.com/garden-io/garden/commit/29da4e2e))
* **windows:** use cross-spawn module to avoid path issues on Windows ([082964cd](https://github.com/garden-io/garden/commit/082964cd))

### Code Refactoring

* rename "workflow" to "task" ([4c7230a4](https://github.com/garden-io/garden/commit/4c7230a4))
* rename Task to BaseTask ([9b40291c](https://github.com/garden-io/garden/commit/9b40291c))
* a few changes to facilitate packaging/bundling ([d0e4035d](https://github.com/garden-io/garden/commit/d0e4035d))
* remove explicit helm and stern installation dependencies ([a160b31a](https://github.com/garden-io/garden/commit/a160b31a))
* add buildDependencies key to plugin module action params ([b24c6a92](https://github.com/garden-io/garden/commit/b24c6a92))
* remove node-pty dependency ([50821961](https://github.com/garden-io/garden/commit/50821961))
* rename `init env` cmd to `init` and remove login cmd ([2998bc4e](https://github.com/garden-io/garden/commit/2998bc4e))
* **build:** remove dependancy on git submodule for k8s ([d2844948](https://github.com/garden-io/garden/commit/d2844948))
* **cli:** remove single char command aliases ([d562fe28](https://github.com/garden-io/garden/commit/d562fe28))
* **docs:** improve cli commands help and description text ([d04e97bb](https://github.com/garden-io/garden/commit/d04e97bb))
* **docs:** re-name auto generated reference files ([cc47d644](https://github.com/garden-io/garden/commit/cc47d644))
* **error-messages:** improve error message for check-docs ([5c4fb3ab](https://github.com/garden-io/garden/commit/5c4fb3ab))
* **go-cli:** install bin deps where Garden expects them ([13fa57cd](https://github.com/garden-io/garden/commit/13fa57cd))
* **go-cli:** use docker sdk and keep containers running ([85dfd132](https://github.com/garden-io/garden/commit/85dfd132))
* **multi-repo:** require tag or branch in repository URLs ([be9b1169](https://github.com/garden-io/garden/commit/be9b1169))

### Features

* tasks/workflows implemented ([de9275b5](https://github.com/garden-io/garden/commit/de9275b5))
* experimental single-binary build via zeit/pkg ([9f8d7bff](https://github.com/garden-io/garden/commit/9f8d7bff))
* allow custom dockerfile path for container modules ([5ecaead3](https://github.com/garden-io/garden/commit/5ecaead3))
* added --hot-reload flag to dev & deploy ([c7796188](https://github.com/garden-io/garden/commit/c7796188))
* hot-reload functionality for local k8s ([ff0001d1](https://github.com/garden-io/garden/commit/ff0001d1))
* garden-cli container build (experimental) ([7d2b5e7a](https://github.com/garden-io/garden/commit/7d2b5e7a))
* **cli:** experimental go frontend CLI ([71c5e382](https://github.com/garden-io/garden/commit/71c5e382))
* **k8s:** print error logs when container fails to start ([69b8cf6b](https://github.com/garden-io/garden/commit/69b8cf6b))
* **k8s:** support remote container registries and remote clusters ([5243c40c](https://github.com/garden-io/garden/commit/5243c40c))


<a name="v0.7.0"></a>
## [v0.7.0](https://github.com/garden-io/garden/compare/v0.6.0...v0.7.0) (2018-09-17)

### Bug Fixes

* windows install script ([0c2a2f02](https://github.com/garden-io/garden/commit/0c2a2f02))
* **examples-projects:** fix integration test ([1d85a9d8](https://github.com/garden-io/garden/commit/1d85a9d8))
* **gulpfile:** ensure tmp dir exists when updating brew tap ([3f2ace8e](https://github.com/garden-io/garden/commit/3f2ace8e))
* **k8s:** name releases based on their namespace ([5fe26e9d](https://github.com/garden-io/garden/commit/5fe26e9d))
* **openfaas:** better cross-platform support ([d1c59d48](https://github.com/garden-io/garden/commit/d1c59d48))
* **publish script:** ensure changelog is properly generated ([e2f1d8ec](https://github.com/garden-io/garden/commit/e2f1d8ec))
* **publish-script:** set remote in git push command ([26356bf3](https://github.com/garden-io/garden/commit/26356bf3))

### Code Refactoring

* rename endpoints to ingresses ([dde932f2](https://github.com/garden-io/garden/commit/dde932f2))
* tighten plugin context API considerably ([af2af06f](https://github.com/garden-io/garden/commit/af2af06f))
* **logger:** clean up code + enable empty log entries ([a83117ac](https://github.com/garden-io/garden/commit/a83117ac))

### Features

* windows installer cont'd (to be squashed) ([5ff7af54](https://github.com/garden-io/garden/commit/5ff7af54))
* windows installer ([70c44ab3](https://github.com/garden-io/garden/commit/70c44ab3))

### BREAKING CHANGE


Users may need to delete and re-init their projects when using the
Kubernetes plugins after installing this update, because Helm may get
confused by the changes.


<a name="v0.6.0"></a>
## [v0.6.0](https://github.com/garden-io/garden/compare/v0.5.1...v0.6.0) (2018-09-17)

### Bug Fixes

* **publish-script:** set remote in git push command ([aa035570](https://github.com/garden-io/garden/commit/aa035570))


<a name="v0.5.1"></a>
## [v0.5.1](https://github.com/garden-io/garden/compare/v0.5.0...v0.5.1) (2018-09-13)

### Bug Fixes

* fix ignore package import ([00721c38](https://github.com/garden-io/garden/commit/00721c38))
* catch and log task errors as they happen ([46eef922](https://github.com/garden-io/garden/commit/46eef922))
* fix publish script ([7d847519](https://github.com/garden-io/garden/commit/7d847519))
* **call-command:** print correct protocol ([d9730582](https://github.com/garden-io/garden/commit/d9730582))
* **config:** remove name field from service endpoint spec ([9f6f9f0a](https://github.com/garden-io/garden/commit/9f6f9f0a))
* **examples:** unused import in go-service ([25509cf5](https://github.com/garden-io/garden/commit/25509cf5))
* **examples-projects:** fix integration test ([1d85a9d8](https://github.com/garden-io/garden/commit/1d85a9d8))
* **openfaas:** external endpoints had incorrect path ([64de8983](https://github.com/garden-io/garden/commit/64de8983))

### Code Refactoring

* rename endpoints to ingresses ([dde932f2](https://github.com/garden-io/garden/commit/dde932f2))
* tighten plugin context API considerably ([af2af06f](https://github.com/garden-io/garden/commit/af2af06f))
* get rid of native OpenSSL dependency ([64e962ae](https://github.com/garden-io/garden/commit/64e962ae))
* **logger:** clean up code + enable empty log entries ([a83117ac](https://github.com/garden-io/garden/commit/a83117ac))

### BREAKING CHANGE


Endpoint names will have to be removed from module configs.


<a name="v0.5.0"></a>
## [v0.5.0](https://github.com/garden-io/garden/compare/v0.4.0...v0.5.0) (2018-09-05)

### Bug Fixes

* init file writers in Garden class ([d982b66d](https://github.com/garden-io/garden/commit/d982b66d))
* add axios as dependency (was dev dependency) ([4ccdfd84](https://github.com/garden-io/garden/commit/4ccdfd84))
* **k8s:** don't deploy system services when running minikube ([215cabd3](https://github.com/garden-io/garden/commit/215cabd3))
* **k8s:** wait for Tiller pod to be ready when initializing ([a5cd8ebf](https://github.com/garden-io/garden/commit/a5cd8ebf))
* **logger:** ensure ansi chars in section don't break format ([323b6e9f](https://github.com/garden-io/garden/commit/323b6e9f))
* **multi-repo:** ensure external source gets updated if repo url changes ([881c3c77](https://github.com/garden-io/garden/commit/881c3c77))
* **tests:** ensure test project is clean between tests ([b7f66641](https://github.com/garden-io/garden/commit/b7f66641))

### Code Refactoring

* move project config scan to separate function ([db8e8ed0](https://github.com/garden-io/garden/commit/db8e8ed0))
* remove stale module name check ([2f3a94f8](https://github.com/garden-io/garden/commit/2f3a94f8))
* configs are now fully resolved ahead of time in one pass ([a5e55262](https://github.com/garden-io/garden/commit/a5e55262))
* **ctx:** allow specifying plugin name when calling plugin actions ([dec8e358](https://github.com/garden-io/garden/commit/dec8e358))

### Features

* allow configs from subdirectories ([bb464c37](https://github.com/garden-io/garden/commit/bb464c37))
* add 'delete service' command ([2b067c6c](https://github.com/garden-io/garden/commit/2b067c6c))
* **k8s:** support custom hostnames and TLS certs ([1c004f71](https://github.com/garden-io/garden/commit/1c004f71))
* **multi-repos:** allow file URLs ([c072dd91](https://github.com/garden-io/garden/commit/c072dd91))


<a name="v0.4.0"></a>
## [v0.4.0](https://github.com/garden-io/garden/compare/v0.3.1...v0.4.0) (2018-08-14)

### Bug Fixes

* fix linux-specific shellscript errors and integ test ([#229](https://github.com/garden-io/garden/issues/229)) ([1dc936e1](https://github.com/garden-io/garden/commit/1dc936e1))
* **cli:** task results errors weren't handled properly ([b22b580b](https://github.com/garden-io/garden/commit/b22b580b))
* **cli:** allow empty path when calling services via `garden call` ([b5d49728](https://github.com/garden-io/garden/commit/b5d49728))
* **cli:** show ANSI banner image instead of png in dev command ([bb3898f0](https://github.com/garden-io/garden/commit/bb3898f0))
* **k8s:** build status was incorrectly reported for helm modules ([195eee46](https://github.com/garden-io/garden/commit/195eee46))

### Code Refactoring

* **config:** make module name mandatory ([aa83d7f6](https://github.com/garden-io/garden/commit/aa83d7f6))
* **k8s:** make deployment and status checks much more robust ([97f7bf63](https://github.com/garden-io/garden/commit/97f7bf63))

### Features

* add multi-repo support ([740e8580](https://github.com/garden-io/garden/commit/740e8580))
* add OpenFaaS plugin (experimental) ([39ff701a](https://github.com/garden-io/garden/commit/39ff701a))
* add exec command, to run commands in running service containers ([7f74edc0](https://github.com/garden-io/garden/commit/7f74edc0))
* add Windows support (experimental) ([9e9c2184](https://github.com/garden-io/garden/commit/9e9c2184))
* **k8s:** allow specifying namespace to deploy to ([0aebc2b7](https://github.com/garden-io/garden/commit/0aebc2b7))

### BREAKING CHANGE


Module name no longer defaults to directory name but must be explicitly
set in the module's garden.yml file. Any existing garden.yml module files
without a name key must therefore be updated to expclitily provide the
module name.


<a name="v0.3.1"></a>
## [v0.3.1](https://github.com/garden-io/garden/compare/v0.3.0...v0.3.1) (2018-07-16)

### Bug Fixes

* **versioning:** `resolveVersion` should not call `getTreeVersion` ([91ae14f3](https://github.com/garden-io/garden/commit/91ae14f3))
* **versioning:** version string should include dirty timestamp ([61d29d02](https://github.com/garden-io/garden/commit/61d29d02))


<a name="v0.3.0"></a>
## [v0.3.0](https://github.com/garden-io/garden/compare/v0.2.0...v0.3.0) (2018-07-10)

### Bug Fixes

* fixed more issues with cross-repo versioning ([2b0d93e1](https://github.com/garden-io/garden/commit/2b0d93e1))
* set identifier max length to match k8s service name limit ([ad0a54f3](https://github.com/garden-io/garden/commit/ad0a54f3))
* ensure namespace is removed before returning when deleting env ([f381d33f](https://github.com/garden-io/garden/commit/f381d33f))
* **create-commands:** rename function type to google-cloud-function ([49c4c93a](https://github.com/garden-io/garden/commit/49c4c93a))
* **create-module-command:** type option should be an enum ([a8316d16](https://github.com/garden-io/garden/commit/a8316d16))
* **file-writer:** only create file if content to write ([562daa8e](https://github.com/garden-io/garden/commit/562daa8e))
* **release:** publish script should exit on error ([075537f5](https://github.com/garden-io/garden/commit/075537f5))

### Code Refactoring

* build command is now an array, for consistency ([0bf020ab](https://github.com/garden-io/garden/commit/0bf020ab))
* always load container and npm-package plugins ([4bf5d181](https://github.com/garden-io/garden/commit/4bf5d181))
* remove dependency on watchman ([fec104a1](https://github.com/garden-io/garden/commit/fec104a1))
* **k8s:** ensure namespaces are created when needed ([67946eb4](https://github.com/garden-io/garden/commit/67946eb4))
* **k8s:** change metadata namespace name ([6f732995](https://github.com/garden-io/garden/commit/6f732995))

### Features

* add create project/module commands ([b611b35d](https://github.com/garden-io/garden/commit/b611b35d))
* allow numeric log levels ([e2a7b6fd](https://github.com/garden-io/garden/commit/e2a7b6fd))
* **cli:** enable custom hints in help message ([37c31590](https://github.com/garden-io/garden/commit/37c31590))
* **config:** add `${local.platform}` template key ([1c6d4927](https://github.com/garden-io/garden/commit/1c6d4927))
* **container:** add `env` key to specify env vars for containers ([9fa0cb8d](https://github.com/garden-io/garden/commit/9fa0cb8d))
* **generic:** add env var support to generic module type ([a5096eee](https://github.com/garden-io/garden/commit/a5096eee))
* **k8s:** allow specifying default username in k8s provider config ([1e42cfb5](https://github.com/garden-io/garden/commit/1e42cfb5))
* **k8s:** add repo parameter to helm module type ([5d3af140](https://github.com/garden-io/garden/commit/5d3af140))

### Performance Improvements

* generic plugin now keeps track of last built version ([ab3714b3](https://github.com/garden-io/garden/commit/ab3714b3))

### BREAKING CHANGE


Any existing garden.yml files with the `build.command` key set need
to be updated to provide an array of strings as a command, as opposed to
a simple string.

Existing metadata namespaces will have to be manually cleaned up.
We suggest resetting local k8s clusters after upgrading.

The `tests[].variables` config key has been removed from the
`garden.yml` configuration file schema.


<a name="v0.2.0"></a>
## [v0.2.0](https://github.com/garden-io/garden/compare/v0.1.2...v0.2.0) (2018-06-27)

### Bug Fixes

* malformed output from `ctx.getStatus()` ([#134](https://github.com/garden-io/garden/issues/134)) ([d2227210](https://github.com/garden-io/garden/commit/d2227210))
* pin npm version in CircleCI ([206d9467](https://github.com/garden-io/garden/commit/206d9467))
* error in `Module.getVersion()` ([6491678e](https://github.com/garden-io/garden/commit/6491678e))
* broken `npm run dev` after package.json changes ([8bd62173](https://github.com/garden-io/garden/commit/8bd62173))
* module versions are now handled properly across multiple repos ([c647cf9b](https://github.com/garden-io/garden/commit/c647cf9b))
* test result versions now correctly account for test dependencies ([8b8a6bde](https://github.com/garden-io/garden/commit/8b8a6bde))
* add missing lodash dependency (!) ([2abb90c0](https://github.com/garden-io/garden/commit/2abb90c0))
* don't run dist script on every npm install ([c73f5e13](https://github.com/garden-io/garden/commit/c73f5e13))
* **ci:** only do clean install from package-lock ([3c44191e](https://github.com/garden-io/garden/commit/3c44191e))
* **cli:** delete environment command wasn't linked to parent ([e0789f14](https://github.com/garden-io/garden/commit/e0789f14))
* **cli:** set error code when calling CLI with bad command ([bb24acd0](https://github.com/garden-io/garden/commit/bb24acd0))
* **cli:** enforce single character option aliases ([a49e7991](https://github.com/garden-io/garden/commit/a49e7991))
* **cli:** add missing shebang line in garden binary ([632925d1](https://github.com/garden-io/garden/commit/632925d1))
* **container:** build issue where Dockerfile is copied or generated ([c0186d95](https://github.com/garden-io/garden/commit/c0186d95))
* **core:** potential race-condition when parsing modules ([944e150d](https://github.com/garden-io/garden/commit/944e150d))
* **ctx:** better error.log output from `processModules()` ([b0eb86e7](https://github.com/garden-io/garden/commit/b0eb86e7))
* **integ:** fix init env command in integ test script ([f644ec2e](https://github.com/garden-io/garden/commit/f644ec2e))
* **k8s:** better error message when kubectl fails ([41f14828](https://github.com/garden-io/garden/commit/41f14828))
* **k8s:** incorrect use of execa ([cecbaa36](https://github.com/garden-io/garden/commit/cecbaa36))
* **k8s:** patch bugs in kubernetes client ([e45f72a2](https://github.com/garden-io/garden/commit/e45f72a2))
* **logger:** remove unnecessary call to stopLoop ([db845610](https://github.com/garden-io/garden/commit/db845610))
* **vsc:** handle weird stat behavior by wrapping it ([df11647e](https://github.com/garden-io/garden/commit/df11647e))

### Code Refactoring

* consistently use verb before noun in CLI ([e88e55e6](https://github.com/garden-io/garden/commit/e88e55e6))
* switch to official kubernetes client library ([8ccd9a1a](https://github.com/garden-io/garden/commit/8ccd9a1a))
* rename project.global to project.environmentDefaults ([#131](https://github.com/garden-io/garden/issues/131)) ([3ebe1dca](https://github.com/garden-io/garden/commit/3ebe1dca))

### Features

* generate homebrew formula on publish ([72c4b4d7](https://github.com/garden-io/garden/commit/72c4b4d7))
* **build:** Handle config changes in auto-reload. ([9d9295f5](https://github.com/garden-io/garden/commit/9d9295f5))
* **k8s:** add helm module type ([122e6dda](https://github.com/garden-io/garden/commit/122e6dda))

### Performance Improvements

* implemented caching of module version ([e451f7a6](https://github.com/garden-io/garden/commit/e451f7a6))
* got rid of all synchronous subprocess and filesystem calls ([9b624248](https://github.com/garden-io/garden/commit/9b624248))

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
## [v0.1.2](https://github.com/garden-io/garden/compare/v0.1.0...v0.1.2) (2018-06-02)

### Bug Fixes

* add missing prepublish step ([a1dbde98](https://github.com/garden-io/garden/commit/a1dbde98))
* incorrect bin link in package.json ([237ce857](https://github.com/garden-io/garden/commit/237ce857))
* **utils:** gulp dev dependencies and update util/index ([9e65f02d](https://github.com/garden-io/garden/commit/9e65f02d))


<a name="v0.1.0"></a>
## v0.1.0 (2018-05-31)

### Bug Fixes

* allow empty output from test runs ([67a2d956](https://github.com/garden-io/garden/commit/67a2d956))
* syntax error in .release-it.json ([010a138c](https://github.com/garden-io/garden/commit/010a138c))
* allow commands to specify logger type ([893f9e24](https://github.com/garden-io/garden/commit/893f9e24))
* add missing license header ([f6e11d91](https://github.com/garden-io/garden/commit/f6e11d91))
* [#107](https://github.com/garden-io/garden/issues/107) & [#108](https://github.com/garden-io/garden/issues/108) - incl. deps in auto-reload. ([d1aaf5e4](https://github.com/garden-io/garden/commit/d1aaf5e4))
* ensure module build paths have trailing slash (for rsync) ([1c555d12](https://github.com/garden-io/garden/commit/1c555d12))
* fix default log level on header and finish methods ([1eb143d5](https://github.com/garden-io/garden/commit/1eb143d5))
* [#85](https://github.com/garden-io/garden/issues/85) closing gulp watch didn't close tsc process ([4b3a7c45](https://github.com/garden-io/garden/commit/4b3a7c45))
* partial CircleCI status on PRs ([7d0a3ef0](https://github.com/garden-io/garden/commit/7d0a3ef0))
* regression after splitting up GardenContext ([bbb6db5b](https://github.com/garden-io/garden/commit/bbb6db5b))
* issue where module scanning would hang with empty projects ([ec47c72b](https://github.com/garden-io/garden/commit/ec47c72b))
* bug in CLI when handling errors ([f7ae4dd0](https://github.com/garden-io/garden/commit/f7ae4dd0))
* better and more consistent error handling in CLI commands ([36ba7b7c](https://github.com/garden-io/garden/commit/36ba7b7c))
* service outputs were not propagated to runtime context ([0151593f](https://github.com/garden-io/garden/commit/0151593f))
* bad timestamp values could crash log command ([4383d75e](https://github.com/garden-io/garden/commit/4383d75e))
* propagate force flag to deployService action ([6ccc9d06](https://github.com/garden-io/garden/commit/6ccc9d06))
* wrong function name in local-gcf-container ([7a7d5af8](https://github.com/garden-io/garden/commit/7a7d5af8))
* error handling in hello-container ([f778fe9f](https://github.com/garden-io/garden/commit/f778fe9f))
* issue with gulp watch and static files ([dc9cd9f4](https://github.com/garden-io/garden/commit/dc9cd9f4))
* use built-in ingress controller and dashboard for minikube ([879bce21](https://github.com/garden-io/garden/commit/879bce21))
* deploy command would deploy all services from each processed module ([673630c9](https://github.com/garden-io/garden/commit/673630c9))
* Cancel dependants on task error. ([68316083](https://github.com/garden-io/garden/commit/68316083))
* temporarily disabling minikube tests in CI (issues with CircleCI) ([5e1b4bca](https://github.com/garden-io/garden/commit/5e1b4bca))
* better error output when gulp add-version-files fails ([0fc4ee4f](https://github.com/garden-io/garden/commit/0fc4ee4f))
* Cache results to skip superfluous tasks. ([0632e367](https://github.com/garden-io/garden/commit/0632e367))
* fix destroy env command after kubernetes-client upgrade ([200fd018](https://github.com/garden-io/garden/commit/200fd018))
* print json/yaml output after cli returns parse results ([eeadf160](https://github.com/garden-io/garden/commit/eeadf160))
* disable ts-node cache in tests to avoid inconsistencies ([21f2d44e](https://github.com/garden-io/garden/commit/21f2d44e))
* version is now correctly set for plugin modules ([#84](https://github.com/garden-io/garden/issues/84)) ([d9c37572](https://github.com/garden-io/garden/commit/d9c37572))
* remove .vscode directories in multi-container example ([ccd426db](https://github.com/garden-io/garden/commit/ccd426db))
* add missing copyright-header dependency on CircleCI ([ceca5c42](https://github.com/garden-io/garden/commit/ceca5c42))
* add missing dependencies for copyright-header on OSX ([d4d639f5](https://github.com/garden-io/garden/commit/d4d639f5))
* k8s plugin now respects configured context ([a395b792](https://github.com/garden-io/garden/commit/a395b792))
* testModule handlers now receive runtime context ([6ea60b01](https://github.com/garden-io/garden/commit/6ea60b01))
* better output rendering for JSON responses in call command ([1aecfe07](https://github.com/garden-io/garden/commit/1aecfe07))
* better handling of streams not from logger ([42fa17ed](https://github.com/garden-io/garden/commit/42fa17ed))
* linting errors in tests ([185eb696](https://github.com/garden-io/garden/commit/185eb696))
* better kubectl errors ([76fabd64](https://github.com/garden-io/garden/commit/76fabd64))
* minor logging fixes ([bde56fa4](https://github.com/garden-io/garden/commit/bde56fa4))
* Correction to FS watcher subscription logic. ([59699144](https://github.com/garden-io/garden/commit/59699144))
* test name was not included in test result keys ([3dac1860](https://github.com/garden-io/garden/commit/3dac1860))
* Added OperationQueue to TaskGraph. ([ae797859](https://github.com/garden-io/garden/commit/ae797859))
* linting errors ([e839e8eb](https://github.com/garden-io/garden/commit/e839e8eb))
* re-implemented local GCF plugin to fix issues ([3f2ee336](https://github.com/garden-io/garden/commit/3f2ee336))
* add better error logging for kubectl and rsync ([212304ac](https://github.com/garden-io/garden/commit/212304ac))
* issue where build dependencies couldn't be copied ([d3a44cdb](https://github.com/garden-io/garden/commit/d3a44cdb))
* changed how paths are handled when copying build dependencies ([d6506daf](https://github.com/garden-io/garden/commit/d6506daf))
* allow unkown keys in baseModuleSchema ([78303dee](https://github.com/garden-io/garden/commit/78303dee))
* added missing "Done!" message at end of build command ([a05f2c5e](https://github.com/garden-io/garden/commit/a05f2c5e))
* build staging no longer copies symlinks ([0fc60bd0](https://github.com/garden-io/garden/commit/0fc60bd0))
* issues with kubernetes-client after upgrade ([f4096a24](https://github.com/garden-io/garden/commit/f4096a24))
* better logger types ([56596fbe](https://github.com/garden-io/garden/commit/56596fbe))
* package.json & .snyk to reduce vulnerabilities ([0766b56b](https://github.com/garden-io/garden/commit/0766b56b))
* **cli:** duplicate command checks now accounts for subcommands ([b9e22f5f](https://github.com/garden-io/garden/commit/b9e22f5f))
* **cli:** map all Errors to GardenErrors and log accordingly ([02b05b39](https://github.com/garden-io/garden/commit/02b05b39))
* **hello-world:** npm package is now included in function build ([27956534](https://github.com/garden-io/garden/commit/27956534))
* **hello-world-example:** add missing Dockerfile directives ([4acc4cc7](https://github.com/garden-io/garden/commit/4acc4cc7))
* **logger:** more performant update function ([4d8c89e6](https://github.com/garden-io/garden/commit/4d8c89e6))
* **logger:** fix basic-terminal-writer superflous newline ([bfc0fcf4](https://github.com/garden-io/garden/commit/bfc0fcf4))

### Code Refactoring

* move invalid flags check to command setup function ([ee89b74e](https://github.com/garden-io/garden/commit/ee89b74e))
* split up writers into separate modules ([e528b35f](https://github.com/garden-io/garden/commit/e528b35f))
* add processServices alongside processModules helper ([48710228](https://github.com/garden-io/garden/commit/48710228))
* major hardening of internal plugin APIs ([242d0aad](https://github.com/garden-io/garden/commit/242d0aad))
* changed YAML spec to use lists instead of maps in most places ([f1d2548f](https://github.com/garden-io/garden/commit/f1d2548f))
* remove unusued watchModules command ([920eacc1](https://github.com/garden-io/garden/commit/920eacc1))
* merge autoreload command into dev command ([3c78c364](https://github.com/garden-io/garden/commit/3c78c364))
* remove skipAutoReload option ([f96fc5f1](https://github.com/garden-io/garden/commit/f96fc5f1))
* replaced build and test scripts with gulpfile ([05e3c73d](https://github.com/garden-io/garden/commit/05e3c73d))
* changed build dependency copy specs config format ([608f9633](https://github.com/garden-io/garden/commit/608f9633))
* k8s garden-system now deployed via sub-Garden ([4a79c45a](https://github.com/garden-io/garden/commit/4a79c45a))
* move some logic from commands to plugin context ([b7173bea](https://github.com/garden-io/garden/commit/b7173bea))
* major overhaul to plugin architecture ([3b97e088](https://github.com/garden-io/garden/commit/3b97e088))
* split GardenContext into Garden and PluginContext ([04b5417d](https://github.com/garden-io/garden/commit/04b5417d))
* rename GardenContext to Garden ([64bce4fb](https://github.com/garden-io/garden/commit/64bce4fb))
* split Kubernetes plugin into more modules ([e6d84e16](https://github.com/garden-io/garden/commit/e6d84e16))

### Features

* created local-kubernetes plugin and added config options ([1fcf88d8](https://github.com/garden-io/garden/commit/1fcf88d8))
* add truncatePrevious option to file-writer ([a64fbb0c](https://github.com/garden-io/garden/commit/a64fbb0c))
* add force flag to env config command ([d5ba05b3](https://github.com/garden-io/garden/commit/d5ba05b3))
* template variables can now access provider name and config ([51e2f33b](https://github.com/garden-io/garden/commit/51e2f33b))
* support and documentation for Minikube ([b2c632c3](https://github.com/garden-io/garden/commit/b2c632c3))
* Detect circular dependencies. ([4a352767](https://github.com/garden-io/garden/commit/4a352767))
* add scan command to output info about modules in project ([075e6c2b](https://github.com/garden-io/garden/commit/075e6c2b))
* add support for .gardenignore file ([7ba24b73](https://github.com/garden-io/garden/commit/7ba24b73))
* add global --output flag for CLI ([7f256531](https://github.com/garden-io/garden/commit/7f256531))
* add run commands for ad-hoc runs of modules, services and tests ([3aca6aca](https://github.com/garden-io/garden/commit/3aca6aca))
* pass parent to nested log entries ([41cddf06](https://github.com/garden-io/garden/commit/41cddf06))
* add filter and find methods to logger ([814733b6](https://github.com/garden-io/garden/commit/814733b6))
* add login and logout commands ([00548e2a](https://github.com/garden-io/garden/commit/00548e2a))
* add loglevel as cli option and remove silent/verbose options ([985c1606](https://github.com/garden-io/garden/commit/985c1606))
* add watch flag to test and build commands ([dd0a4fe7](https://github.com/garden-io/garden/commit/dd0a4fe7))
* add --watch flag to deploy command ([7b11d58a](https://github.com/garden-io/garden/commit/7b11d58a))
* auto-rebuilding modules & FS watching ([8191aa82](https://github.com/garden-io/garden/commit/8191aa82))
* added buildContext param to buildModule handlers ([141abe9a](https://github.com/garden-io/garden/commit/141abe9a))
* plugins can now add modules to a project ([26f38c78](https://github.com/garden-io/garden/commit/26f38c78))
* user no longer needs to run `env config` command ([8cb65120](https://github.com/garden-io/garden/commit/8cb65120))
* **cli:** validate option flags ([8c249bdd](https://github.com/garden-io/garden/commit/8c249bdd))

### Performance Improvements

* made tests run quite a bit faster ([1aa69fdc](https://github.com/garden-io/garden/commit/1aa69fdc))

### BREAKING CHANGE


This includes some changes to the project schema and how it is resolved,
as well as how the main `Garden` class is instantiated. The `Garden`
class is now called with an environment name, which is then fixed for
the session. The env configuration is resolved by merging the specific
environment configuration with a global configuration specified on the
new `global` key in the project config. The schema for the `providers`
key also different - its keys should now match plugin names, and
contain configuration for those plugins.

