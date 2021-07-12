
<a name="0.12.24"></a>
## [0.12.24](https://github.com/garden-io/garden/compare/0.12.23...0.12.24) (2021-07-09)

### Bug Fixes

* malformed helm manifest ([2ad5e33d](https://github.com/garden-io/garden/commit/2ad5e33d))
* **core:** inconsistency in include/exclude handling for submodules ([9162b5f5](https://github.com/garden-io/garden/commit/9162b5f5))
* **core:** don't apply dev mode to PVC modules ([a8c70e86](https://github.com/garden-io/garden/commit/a8c70e86))
* **core:** log outputs from exec service deploy at verbose level ([113f2881](https://github.com/garden-io/garden/commit/113f2881))
* **k8s:** ingressClass wasn't respected in cert-manager integration ([17e183ab](https://github.com/garden-io/garden/commit/17e183ab))
* **k8s:** logs command wouldn't get logs from all pods ([a6d22fd5](https://github.com/garden-io/garden/commit/a6d22fd5))
* **k8s:** error copying artifacts with new version of tar in image ([e0debafd](https://github.com/garden-io/garden/commit/e0debafd))
* **k8s:** missing stderr in verbose buildkit+kaniko build logs ([2746fcfb](https://github.com/garden-io/garden/commit/2746fcfb))
* **k8s:** apply toleration to kaniko build pods ([f8e19868](https://github.com/garden-io/garden/commit/f8e19868))
* **k8s:** omit probes in runner pod spec ([7826be72](https://github.com/garden-io/garden/commit/7826be72))

### Features

* **config:** add support for module-level variables ([0828c5e1](https://github.com/garden-io/garden/commit/0828c5e1))
* **core:** allow variables in remote sources ([4d65cb2d](https://github.com/garden-io/garden/commit/4d65cb2d))
* **template:** add yamlEncode and yamlDecode template helpers ([dbaf972f](https://github.com/garden-io/garden/commit/dbaf972f))

### Improvements

* **core:** add get tests command ([d610afdd](https://github.com/garden-io/garden/commit/d610afdd))

<a name="0.12.23"></a>
## [0.12.23](https://github.com/garden-io/garden/compare/0.12.22...0.12.23) (2021-06-16)

### Bug Fixes

* **core:** support git 2.32.0 ([32cb2d7f](https://github.com/garden-io/garden/commit/32cb2d7f))
* **k8s:** remove unnecessary build step for kubernetes modules ([26d4d125](https://github.com/garden-io/garden/commit/26d4d125))
* **k8s:** ensure project namespace exists ahead of kaniko build ([a1c9c67c](https://github.com/garden-io/garden/commit/a1c9c67c))
* **workflows:** error when running `garden` in a workflow script step ([dd812238](https://github.com/garden-io/garden/commit/dd812238))

### Code Refactoring

* **logger:** do not store entries in-memory unless needed ([d512a430](https://github.com/garden-io/garden/commit/d512a430))

### Features

* add one-way-replica as additional devMode.sync.mode ([bcb16e82](https://github.com/garden-io/garden/commit/bcb16e82))
* **container:** allow specifying preferred local port for port-forwards ([ba9838bf](https://github.com/garden-io/garden/commit/ba9838bf))
* **core:** allow opt aliases in ${command.params} ([ce8b2aad](https://github.com/garden-io/garden/commit/ce8b2aad))
* **exec:** add services to exec modules ([852db05a](https://github.com/garden-io/garden/commit/852db05a))

### Improvements

* **cloud:** better API errors ([5b959581](https://github.com/garden-io/garden/commit/5b959581))
* **cloud:** better secrets errors ([7d64bdcc](https://github.com/garden-io/garden/commit/7d64bdcc))
* **core:** tweak log output during builds ([3766ad28](https://github.com/garden-io/garden/commit/3766ad28))

<a name="0.12.22"></a>
## [0.12.22](https://github.com/garden-io/garden/compare/0.12.21...0.12.22) (2021-05-26)

### Bug Fixes

* **cli:** missing version update message ([a8fa1a34](https://github.com/garden-io/garden/commit/a8fa1a34))
* **cloud:** retry streaming on network error ([93ecf062](https://github.com/garden-io/garden/commit/93ecf062))
* **core:** catch EPIPE error when closing port proxies ([bdb00854](https://github.com/garden-io/garden/commit/bdb00854))
* **core:** ensure pod runner throws when container is OOMKilled ([9dd044a3](https://github.com/garden-io/garden/commit/9dd044a3))
* **k8s:** timeout/OOM error when pulling large image to local docker ([d92ed5f7](https://github.com/garden-io/garden/commit/d92ed5f7))
* **k8s:** unnecessary socat sidecar being deployed with BuildKit ([e4f22def](https://github.com/garden-io/garden/commit/e4f22def))
* **k8s:** errors in cleanup-cluster-registry command ([e17d9362](https://github.com/garden-io/garden/commit/e17d9362))
* **k8s:** automatic retry for failed API requests ([72165da7](https://github.com/garden-io/garden/commit/72165da7))

### Features

* **config:** add version key to runtime.* template context ([1c647414](https://github.com/garden-io/garden/commit/1c647414))
* **container:** custom min/max resources ([2c6353bc](https://github.com/garden-io/garden/commit/2c6353bc))
* **k8s:** resolve template strings in kubernetes module manifest files ([07a7fd83](https://github.com/garden-io/garden/commit/07a7fd83))
* **k8s:** add exec to kubernetes and helm modules ([ea11bb6a](https://github.com/garden-io/garden/commit/ea11bb6a))
* **template:** add timeout definitions for container module healthcheck ([d716c9ad](https://github.com/garden-io/garden/commit/d716c9ad))

### Improvements

* **core:** better alignment for logs command ([80487643](https://github.com/garden-io/garden/commit/80487643))
* **core:** better logs command ([3778d238](https://github.com/garden-io/garden/commit/3778d238))
* **exec:** show test and task logs when log level is verbose ([9fd19afe](https://github.com/garden-io/garden/commit/9fd19afe))
* **k8s:** get rid of NFS when using kaniko build mode ([143e5372](https://github.com/garden-io/garden/commit/143e5372))

<a name="0.12.21"></a>
## [0.12.21](https://github.com/garden-io/garden/compare/0.12.20...0.12.21) (2021-04-26)

### Bug Fixes

* **cli:** don't complain in port forward cleanup handler ([af5bc97f](https://github.com/garden-io/garden/commit/af5bc97f))
* **core:** include deps in test version ([8e7ce4ca](https://github.com/garden-io/garden/commit/8e7ce4ca))
* **core:** handle undefined stdout/stderr on exec module failures ([b439c866](https://github.com/garden-io/garden/commit/b439c866))
* **enterprise:** ensure exit code and --yes flag work ([65303d41](https://github.com/garden-io/garden/commit/65303d41))

### Features

* dev mode with much better container syncing ([9537765b](https://github.com/garden-io/garden/commit/9537765b))
* **commands:** skip-dependants opt for test cmd ([6a7d6c56](https://github.com/garden-io/garden/commit/6a7d6c56))
* **enterprise:** stream namespace events ([f0431b5b](https://github.com/garden-io/garden/commit/f0431b5b))
* **workflows:** only resolve config being run ([3ad56c82](https://github.com/garden-io/garden/commit/3ad56c82))

### Improvements

* **core:** add runModule handler to exec module ([48914c11](https://github.com/garden-io/garden/commit/48914c11))
* **core:** increase liveness probes when in hot-reload mode ([25eb6344](https://github.com/garden-io/garden/commit/25eb6344))

<a name="0.12.20"></a>
## [0.12.20](https://github.com/garden-io/garden/compare/0.12.19...0.12.20) (2021-03-29)

### Bug Fixes

* **core:** default back to rsync build staging on Windows ([d96e490e](https://github.com/garden-io/garden/commit/d96e490e))
* **core:** potential edge-case issue with versions and generateFiles ([7a74588a](https://github.com/garden-io/garden/commit/7a74588a))
* **core:** fix logout when authenticated against different GE instance ([ace99fc0](https://github.com/garden-io/garden/commit/ace99fc0))
* **enterprise:** fix api response shape ([8e0ac895](https://github.com/garden-io/garden/commit/8e0ac895))
* **k8s:** bad error message when failing to get build status ([d8481b23](https://github.com/garden-io/garden/commit/d8481b23))

### Code Refactoring

* **core:** refactor enterprise api ([51f4807a](https://github.com/garden-io/garden/commit/51f4807a))

### Features

* **config:** add `this` context when resolving modules ([4b242404](https://github.com/garden-io/garden/commit/4b242404))
* **enterprise:** add requests to workflows ([d33194c0](https://github.com/garden-io/garden/commit/d33194c0))
* **enterprise:** add utility commands to manage enterprise resources ([9ac421ce](https://github.com/garden-io/garden/commit/9ac421ce))
* **k8s:** apply container service annotations to Pod templates as well ([f5abdd48](https://github.com/garden-io/garden/commit/f5abdd48))
* **template:** add template helper functions ([c08afe7b](https://github.com/garden-io/garden/commit/c08afe7b))

### Improvements

* **cli:** allow `garden delete services` with no arguments ([6a728e51](https://github.com/garden-io/garden/commit/6a728e51))
* **core:** more granular version hashes ([d6f13737](https://github.com/garden-io/garden/commit/d6f13737))
* **enterprise:** better error message on login 401 errors ([b84239b3](https://github.com/garden-io/garden/commit/b84239b3))
* **k8s:** update k8s client library ([2ab568e6](https://github.com/garden-io/garden/commit/2ab568e6))
* **k8s:** cache DNS lookups for cluster hostnames ([667646bd](https://github.com/garden-io/garden/commit/667646bd))

<a name="0.12.19"></a>
## [0.12.19](https://github.com/garden-io/garden/compare/0.12.18...0.12.19) (2021-03-10)

### Bug Fixes

* **dashboard:** styling issues when scrollbars are always visible ([3940106f](https://github.com/garden-io/garden/commit/3940106f))
* **dashboard:** visible scrollbar in overview cards ([463fa5b3](https://github.com/garden-io/garden/commit/463fa5b3))
* **dashboard:** bad alignment of logs view with small amount of logs ([edaefae6](https://github.com/garden-io/garden/commit/edaefae6))
* **enterprise:** handle requests that fail before reaching the server ([c21a1b43](https://github.com/garden-io/garden/commit/c21a1b43))
* **k8s:** failures when publishing images from external registries ([63a993ad](https://github.com/garden-io/garden/commit/63a993ad))
* **k8s:** potential memory issue when fetching artifacts ([5ac7822a](https://github.com/garden-io/garden/commit/5ac7822a))
* **k8s:** handle injected service mesh containers for tests+tasks ([a9f66970](https://github.com/garden-io/garden/commit/a9f66970))
* **k8s:** typo in target image argument for buildkit ([88ad554a](https://github.com/garden-io/garden/commit/88ad554a))

### Features

* **enterprise:** add baseBranch trigger filters ([f0ecf9c8](https://github.com/garden-io/garden/commit/f0ecf9c8))
* **workflows:** workflow-level env variables ([#2295](https://github.com/garden-io/garden/issues/2295)) ([625cd10c](https://github.com/garden-io/garden/commit/625cd10c))

### Improvements

* **dashboard:** better rendering of entity status cards ([a18b74b2](https://github.com/garden-io/garden/commit/a18b74b2))
* **dashboard:** add background color to legend ([22311844](https://github.com/garden-io/garden/commit/22311844))
* **dashboard:** change menu layout and update styling ([a34fa07e](https://github.com/garden-io/garden/commit/a34fa07e))

<a name="0.12.18"></a>
## [0.12.18](https://github.com/garden-io/garden/compare/0.12.17...0.12.18) (2021-03-02)

### Bug Fixes

* **build-stage:** don't throw when setting utime on missing file ([3cbdfef4](https://github.com/garden-io/garden/commit/3cbdfef4))
* **cli:** don't output file lists and dep versions in scan command ([8bdb7020](https://github.com/garden-io/garden/commit/8bdb7020))
* **cli:** don't print "Tools" header in tools command ([07a06fd2](https://github.com/garden-io/garden/commit/07a06fd2))
* **core:** slow initial scan of Garden config files ([5ea75458](https://github.com/garden-io/garden/commit/5ea75458))
* **core:** error when using generateFiles in a remote module/source ([2a3fbae1](https://github.com/garden-io/garden/commit/2a3fbae1))
* **k8s:** error with missing metadata field ([e2bbe0d2](https://github.com/garden-io/garden/commit/e2bbe0d2))
* **k8s:** buildkitd deployment status incorrectly reported as outdated ([c99f247e](https://github.com/garden-io/garden/commit/c99f247e))

### Features

* **cli:** allow setting environment with GARDEN_ENVIRONMENT ([51d885d5](https://github.com/garden-io/garden/commit/51d885d5))
* **config:** allow sparse arrays where appropriate in config schemas ([99b5c720](https://github.com/garden-io/garden/commit/99b5c720))
* **k8s:** add garden-build toleration to garden-buildkit deployments ([e4bc2b7d](https://github.com/garden-io/garden/commit/e4bc2b7d))
* **terraform:** add v0.14.7 as a supported version ([9a1ad238](https://github.com/garden-io/garden/commit/9a1ad238))

### Improvements

* **core:** faster file scanning on modules with includes set ([b841837f](https://github.com/garden-io/garden/commit/b841837f))
* **core:** add caching and concurrency lock on directory scans ([03b6f10c](https://github.com/garden-io/garden/commit/03b6f10c))
* **core:** don't scan for files if module has `include: []` ([05f0f1f6](https://github.com/garden-io/garden/commit/05f0f1f6))
* **k8s:** get rid of separate metadata namespace ([07031128](https://github.com/garden-io/garden/commit/07031128))

<a name="0.12.17"></a>
## [0.12.17](https://github.com/garden-io/garden/compare/0.12.16...0.12.17) (2021-02-22)

### Bug Fixes

* **k8s:** garden publish command now works with any deploymentRegistry ([4fffdbfe](https://github.com/garden-io/garden/commit/4fffdbfe))

### Code Refactoring

* split up config-context module ([6919bc56](https://github.com/garden-io/garden/commit/6919bc56))
* **k8s:** split container build module up ([c9d0a583](https://github.com/garden-io/garden/commit/c9d0a583))

### Features

* **config:** add ${command.name} and ${command.params} for templating ([d31922df](https://github.com/garden-io/garden/commit/d31922df))
* **core:** lower case username for templates ([d6b94aaf](https://github.com/garden-io/garden/commit/d6b94aaf))
* **helm:** allow disabling atomic installs/upgrades ([6247cef1](https://github.com/garden-io/garden/commit/6247cef1))
* **k8s:** add `clusterBuildkit.nodeSelector` config option ([91376d7e](https://github.com/garden-io/garden/commit/91376d7e))
* **k8s:** allow setting annotations and labels on project namespace ([6f24beed](https://github.com/garden-io/garden/commit/6f24beed))
* **k8s:** add cluster-buildkit buildMode ([15f2ab51](https://github.com/garden-io/garden/commit/15f2ab51))
* **publish:** add template-able --tag parameter to publish command ([51acfb2a](https://github.com/garden-io/garden/commit/51acfb2a))
* **template:** allow escaping template strings for generated files ([86cd2ffa](https://github.com/garden-io/garden/commit/86cd2ffa))

### Improvements

* **dashboard:** better Stack Graph layout ([665d82ea](https://github.com/garden-io/garden/commit/665d82ea))

<a name="0.12.16"></a>
## [0.12.16](https://github.com/garden-io/garden/compare/0.12.15...0.12.16) (2021-02-04)

### Bug Fixes

* **cli:** regression in exec command parameter handling ([bea46edf](https://github.com/garden-io/garden/commit/bea46edf))
* **config:** pass optional templates through during partial resolution ([c4dac8b8](https://github.com/garden-io/garden/commit/c4dac8b8))
* **k8s:** fix potential GCR auth issue + simpler GKE+GCR instructions ([6df0fa4a](https://github.com/garden-io/garden/commit/6df0fa4a))
* **k8s:** issues with GCR auth when running in-cluster builds on GKE ([1d01ed6c](https://github.com/garden-io/garden/commit/1d01ed6c))
* **k8s:** error in status checks for missing CRD manifests ([4713cbd2](https://github.com/garden-io/garden/commit/4713cbd2))
* **k8s:** fix some issues with KinD and add CI tests ([78e79c13](https://github.com/garden-io/garden/commit/78e79c13))
* **k8s:** fix issues with minikube v1.17 ([9b6015c1](https://github.com/garden-io/garden/commit/9b6015c1))
* **workflows:** error referencing undefined vars in workflow templates ([7591cb17](https://github.com/garden-io/garden/commit/7591cb17))

### Code Refactoring

* break up runAndCopy ([4ac311d8](https://github.com/garden-io/garden/commit/4ac311d8))
* reduce work at module resolution time ([e8ef6b22](https://github.com/garden-io/garden/commit/e8ef6b22))

### Features

* **cli:** add --skip parameter to deploy command ([10bc98fa](https://github.com/garden-io/garden/commit/10bc98fa))
* **k8s:** use pod spec fields in tasks and tests ([ce1e8ed3](https://github.com/garden-io/garden/commit/ce1e8ed3))
* **templates:** allow concatenating arrays with + operator ([4b8a5bb1](https://github.com/garden-io/garden/commit/4b8a5bb1))
* **workflows:** add envVars field for script steps ([857e8458](https://github.com/garden-io/garden/commit/857e8458))

### Improvements

* **cli:** allow multiple instances of array option parameters ([844126e6](https://github.com/garden-io/garden/commit/844126e6))
* **core:** default to new build staging mechanism ([5a218941](https://github.com/garden-io/garden/commit/5a218941))

<a name="0.12.15"></a>
## [0.12.15](https://github.com/garden-io/garden/compare/0.12.14...0.12.15) (2021-01-21)

### Bug Fixes

* **workflow:** register workflow only if user is logged in ([a0c22e99](https://github.com/garden-io/garden/commit/a0c22e99))

<a name="0.12.14"></a>
## [0.12.14](https://github.com/garden-io/garden/compare/0.12.13...0.12.14) (2021-01-20)

### Bug Fixes

* **k8s:** regression in port-forward handler ([723b1ae7](https://github.com/garden-io/garden/commit/723b1ae7))

<a name="0.12.13"></a>
## [0.12.13](https://github.com/garden-io/garden/compare/0.12.12...0.12.13) (2021-01-06)

### Bug Fixes

* **enterprise:** also validate env tokens ([540d0618](https://github.com/garden-io/garden/commit/540d0618))
* **enterprise:** fix login/token flow ([32c14f80](https://github.com/garden-io/garden/commit/32c14f80))
* **enterprise:** more fixes to login flow ([8e558e1c](https://github.com/garden-io/garden/commit/8e558e1c))
* **enterprise:** fix secrets res ([a064a169](https://github.com/garden-io/garden/commit/a064a169))
* **enterprise:** limit log streaming to workflows ([63b9e5d8](https://github.com/garden-io/garden/commit/63b9e5d8))
* **enterprise:** don't throw if log out fails ([65ecd850](https://github.com/garden-io/garden/commit/65ecd850))
* **enterprise:** fix start interval when using access tokens ([#2211](https://github.com/garden-io/garden/issues/2211)) ([3953c5a9](https://github.com/garden-io/garden/commit/3953c5a9))
* **enterprise:** lower workflow resource minima ([e457bded](https://github.com/garden-io/garden/commit/e457bded))
* **k8s:** hanging port forward processes on Windows ([d6dcd451](https://github.com/garden-io/garden/commit/d6dcd451))
* **k8s:** gracefully fail if minikube ingress addon can't be enabled ([c505c4f3](https://github.com/garden-io/garden/commit/c505c4f3))
* **k8s:** confusing error message when resource type doesn't exist ([ef70e194](https://github.com/garden-io/garden/commit/ef70e194))
* **proxy:** fix error handling when unable to bind proxy to a port ([5e047125](https://github.com/garden-io/garden/commit/5e047125))
* **terraform:** make sure terraform init is run before workspace list ([9950c1e6](https://github.com/garden-io/garden/commit/9950c1e6))

### Features

* **config:** add ${local.projectPath} template key ([882e15b8](https://github.com/garden-io/garden/commit/882e15b8))
* **config:** allow template strings in project source definition ([367f7171](https://github.com/garden-io/garden/commit/367f7171))
* **core:** allow disabling port forwards ([060cef45](https://github.com/garden-io/garden/commit/060cef45))
* **enterprise:** implement refresh of auth token ([db40a0c5](https://github.com/garden-io/garden/commit/db40a0c5))

### Improvements

* **core:** set consistent header logs on all commands ([3c2747a6](https://github.com/garden-io/garden/commit/3c2747a6))
* **dashboard:** show proper dependencies of disabled graph nodes ([3a2788cb](https://github.com/garden-io/garden/commit/3a2788cb))
* **docs:** quick fix on 'welcome' page ([bc2de8f5](https://github.com/garden-io/garden/commit/bc2de8f5))
* **docs:** add support forum and enterprise to 'welcome' page ([c5a07f32](https://github.com/garden-io/garden/commit/c5a07f32))
* **enterprise:** include message metadata with log entries ([e9710e51](https://github.com/garden-io/garden/commit/e9710e51))

<a name="0.12.12"></a>
## [0.12.12](https://github.com/garden-io/garden/compare/0.12.11...0.12.12) (2021-01-06)

### Bug Fixes

* use archive stable repository ([b007a8c1](https://github.com/garden-io/garden/commit/b007a8c1))
* **core:** prohibit templates in workflow name ([fa5df971](https://github.com/garden-io/garden/commit/fa5df971))
* **helm:** use archive stable repository ([#2174](https://github.com/garden-io/garden/issues/2174)) ([1e144006](https://github.com/garden-io/garden/commit/1e144006))
* **k8s:** upgrade from deprecated nginx helm chart ([2eaac5f3](https://github.com/garden-io/garden/commit/2eaac5f3))

### Features

* **template:** support if-blocks for multi-line conditionals ([884fe328](https://github.com/garden-io/garden/commit/884fe328))

### Improvements

* **core:** more efficient file scanning with multiple ignores ([3604da3c](https://github.com/garden-io/garden/commit/3604da3c))

<a name="0.12.11"></a>
## [0.12.11](https://github.com/garden-io/garden/compare/0.12.10...0.12.11) (2020-12-01)

### Bug Fixes

* **core:** regression when copying single files in build dependencies ([af61bde2](https://github.com/garden-io/garden/commit/af61bde2))

<a name="0.12.10"></a>
## [0.12.10](https://github.com/garden-io/garden/compare/0.12.9...0.12.10) (2020-11-30)

### Bug Fixes

* **core:** fix failing port forwards on Windows in certain scenarios ([358efa33](https://github.com/garden-io/garden/commit/358efa33))
* **core:** incorrect paths in build staging rsync command ([f38d4293](https://github.com/garden-io/garden/commit/f38d4293))
* **core:** don't flag remote modules as overlapping with modules in root ([8059741b](https://github.com/garden-io/garden/commit/8059741b))
* **core:** auto-exclude git and .garden dirs for modules in project root ([bf854a5a](https://github.com/garden-io/garden/commit/bf854a5a))
* **core:** ensure primitive values are not cast on schema validation ([58946c69](https://github.com/garden-io/garden/commit/58946c69))
* **enterprise:** add workflowError event ([2709fab5](https://github.com/garden-io/garden/commit/2709fab5))
* **enterprise:** whitelist commands for streaming ([f7497888](https://github.com/garden-io/garden/commit/f7497888))
* **enterprise:** add step skipped event ([f644cdb8](https://github.com/garden-io/garden/commit/f644cdb8))
* **enterprise:** don't resolve config on login ([ba93b23d](https://github.com/garden-io/garden/commit/ba93b23d))
* **k8s:** containerModule refs in helm modules not creating build deps ([3fdd0e5a](https://github.com/garden-io/garden/commit/3fdd0e5a))

### Features

* **core:** provide git branch to template strings ([5d79d978](https://github.com/garden-io/garden/commit/5d79d978))
* **terraform:** add support for workspaces ([23975f46](https://github.com/garden-io/garden/commit/23975f46))
* **workflows:** implemented when modifier ([d2104612](https://github.com/garden-io/garden/commit/d2104612))

### Improvements

* **core:** experimental build stage implementation without rsync ([dcd8be7f](https://github.com/garden-io/garden/commit/dcd8be7f))
* **core:** allow wildcard in first label in hostname ([2a5f304e](https://github.com/garden-io/garden/commit/2a5f304e))
* **exec:** log build output with verbose logger ([bd7c81ae](https://github.com/garden-io/garden/commit/bd7c81ae))

<a name="0.12.9"></a>
## [0.12.9](https://github.com/garden-io/garden/compare/0.12.8...0.12.9) (2020-10-21)

### Bug Fixes

* **core:** stay in filesystem root so source paths make sense ([4b43703c](https://github.com/garden-io/garden/commit/4b43703c))
* **core:** create artifact placeholder in a world-readable place ([3daaffa6](https://github.com/garden-io/garden/commit/3daaffa6))
* **kubernetes-module:** fix regression ([f1c521f2](https://github.com/garden-io/garden/commit/f1c521f2))

<a name="0.12.8"></a>
## [0.12.8](https://github.com/garden-io/garden/compare/0.12.7...0.12.8) (2020-10-15)

### Bug Fixes

* **cli:** fix regression in error logging ([6ef165af](https://github.com/garden-io/garden/commit/6ef165af))
* **cli:** less noisy error rendering for workflows ([45f1f917](https://github.com/garden-io/garden/commit/45f1f917))
* **cli:** fix error rendering for yaml output ([37d21cf7](https://github.com/garden-io/garden/commit/37d21cf7))
* **core:** some conditional template strings were not resolved correctly ([8d66c36c](https://github.com/garden-io/garden/commit/8d66c36c))
* **core:** fix circular dependency detection ([802f118e](https://github.com/garden-io/garden/commit/802f118e))
* **workflows:** forbid use of global options ([34d980f7](https://github.com/garden-io/garden/commit/34d980f7))

### Features

* **k8s:** enable hot reloading for kubernetes modules ([878b50eb](https://github.com/garden-io/garden/commit/878b50eb))

### Improvements

* include timestamps in JSON logger ([85e32f65](https://github.com/garden-io/garden/commit/85e32f65))
* **k8s:** show more pod log lines by default ([91a6976f](https://github.com/garden-io/garden/commit/91a6976f))

<a name="0.12.7"></a>
## [0.12.7](https://github.com/garden-io/garden/compare/0.12.6...0.12.7) (2020-09-24)

### Bug Fixes

* **cli:** error in tools command when defaultNamespace=null on an env ([27af1fdd](https://github.com/garden-io/garden/commit/27af1fdd))
* **cli:** bad error message when --env namespace is set on some commands ([cd41a1f5](https://github.com/garden-io/garden/commit/cd41a1f5))
* **cli:** update docs for microk8s commands ([7249ab69](https://github.com/garden-io/garden/commit/7249ab69))
* **cli:** update microk8s commands ([6b5cff6c](https://github.com/garden-io/garden/commit/6b5cff6c))
* **core:** omit dependencyResults from events ([a0d38339](https://github.com/garden-io/garden/commit/a0d38339))
* **enterprise:** fix batch sizing logic ([da367308](https://github.com/garden-io/garden/commit/da367308))

### Features

* **core:** add ModuleTemplates and templated modules ([3c60e61a](https://github.com/garden-io/garden/commit/3c60e61a))

### Improvements

* **core:** resolve remote sources in parallel ([#2097](https://github.com/garden-io/garden/issues/2097)) ([1e3dce0f](https://github.com/garden-io/garden/commit/1e3dce0f))
* **template:** return partially resolved conditionals unchanged ([d30b8567](https://github.com/garden-io/garden/commit/d30b8567))

<a name="0.12.6"></a>
## [0.12.6](https://github.com/garden-io/garden/compare/0.12.5...0.12.6) (2020-09-24)

### Bug Fixes

* **enterprise:** fix workflow registration ([83c8c0a1](https://github.com/garden-io/garden/commit/83c8c0a1))
* **enterprise:** add pull-request-closed as trigger event ([b1ef26b2](https://github.com/garden-io/garden/commit/b1ef26b2))
* **k8s:** fix IO handling for exec command ([e06b08d4](https://github.com/garden-io/garden/commit/e06b08d4))
* **logger:** always use latest timestamp ([c071acd4](https://github.com/garden-io/garden/commit/c071acd4))

### Features

* **cli:** add --show-timestamps flag to CLI commands ([f09deae1](https://github.com/garden-io/garden/commit/f09deae1))
* **enterprise:** enable authentication via ci-tokens ([afe80dd6](https://github.com/garden-io/garden/commit/afe80dd6))
* **enterprise:** register internal workflows ([a4d5c234](https://github.com/garden-io/garden/commit/a4d5c234))
* **terraform:** allow setting version to null to use terraform on PATH ([3b5a0f18](https://github.com/garden-io/garden/commit/3b5a0f18))
* **terraform:** add v0.13.3 as a supported version ([18db4ef8](https://github.com/garden-io/garden/commit/18db4ef8))

### Improvements

* add explicit warn message ([fc590e14](https://github.com/garden-io/garden/commit/fc590e14))

<a name="0.12.5"></a>
## [0.12.5](https://github.com/garden-io/garden/compare/0.12.4...0.12.5) (2020-09-14)

### Bug Fixes

* **core:** fix default environment resolution ([19e5f551](https://github.com/garden-io/garden/commit/19e5f551))

<a name="0.12.4"></a>
## [0.12.4](https://github.com/garden-io/garden/compare/v0.12.3...0.12.4) (2020-09-10)

### Bug Fixes

* **cli:** fix startup time regression after added OOM handling ([fb5f2127](https://github.com/garden-io/garden/commit/fb5f2127))
* **cli:** handle option flags in any order ([3b24339e](https://github.com/garden-io/garden/commit/3b24339e))
* **enterprise:** enforce stream batch size ([90ab9d08](https://github.com/garden-io/garden/commit/90ab9d08))
* **k8s:** fix some issues with the cleanup-cluster-registry command ([56d1a2f3](https://github.com/garden-io/garden/commit/56d1a2f3))
* **k8s:** filter out undefined environment variable values ([852b85c6](https://github.com/garden-io/garden/commit/852b85c6))
* **k8s:** error with basic auth on WebSocket connections ([07488d47](https://github.com/garden-io/garden/commit/07488d47))
* **k8s:** handle yet another Pod failure mode (fixes flaky test) ([09334832](https://github.com/garden-io/garden/commit/09334832))

### Code Refactoring

* pull conftest plugins out of core package ([6f4814e4](https://github.com/garden-io/garden/commit/6f4814e4))
* move a bit of code from core to cli package ([469ca7d1](https://github.com/garden-io/garden/commit/469ca7d1))

### Features

* **cli:** add `get module(s)` command ([854509c5](https://github.com/garden-io/garden/commit/854509c5))
* **container:** add deployment-image-id module output key ([e2f0d8df](https://github.com/garden-io/garden/commit/e2f0d8df))
* **enterprise:** enable secrets in more contexts ([6e92c38d](https://github.com/garden-io/garden/commit/6e92c38d))

### Improvements

* explicitly catch EMFILE errors with better error message ([37975c86](https://github.com/garden-io/garden/commit/37975c86))
* add plugin alias for plugins command ([dde8409e](https://github.com/garden-io/garden/commit/dde8409e))
* **cli:** catch OOM errors and exit with helpful error message ([d7ad8d85](https://github.com/garden-io/garden/commit/d7ad8d85))
* **core:** use typeorm migrations instead of auto-synchronize ([b771949c](https://github.com/garden-io/garden/commit/b771949c))
* **core:** switch to better-sqlite3 driver ([c41d1d96](https://github.com/garden-io/garden/commit/c41d1d96))
* **core:** warn on large file count in modules ([3ee20dcb](https://github.com/garden-io/garden/commit/3ee20dcb))

<a name="v0.12.3"></a>
## [v0.12.3](https://github.com/garden-io/garden/compare/v0.12.2...v0.12.3) (2020-08-27)

### Bug Fixes

* reference error in error handling clause ([4c849bee](https://github.com/garden-io/garden/commit/4c849bee))
* review comments (TBS) ([5b89c8cc](https://github.com/garden-io/garden/commit/5b89c8cc))
* **config:** allow empty strings in commands and args ([5a9228b2](https://github.com/garden-io/garden/commit/5a9228b2))
* **config:** incorrect handling of bracketed template keys with dots ([f1cdfeee](https://github.com/garden-io/garden/commit/f1cdfeee))
* **container:** don't append version to Deployment name for rolling upd. ([00cf3bde](https://github.com/garden-io/garden/commit/00cf3bde))
* **core:** undefined tool error in container module derivatives ([03f6fccf](https://github.com/garden-io/garden/commit/03f6fccf))
* **core:** error with rsync v3.2.3 and later on certain OSes ([3cb4da64](https://github.com/garden-io/garden/commit/3cb4da64))
* **dashboard:** set correct icon hover color ([d6aee9f8](https://github.com/garden-io/garden/commit/d6aee9f8))
* **dashboard:** attempt to reconnect when ws connection is lost ([15fc73be](https://github.com/garden-io/garden/commit/15fc73be))
* **dashboard:** incorrect padding on service name in logs ([eb2cd07f](https://github.com/garden-io/garden/commit/eb2cd07f))
* **enterprise:** fix login flow ([36865bc4](https://github.com/garden-io/garden/commit/36865bc4))
* **enterprise:** validate domain as URI ([85ae9ee7](https://github.com/garden-io/garden/commit/85ae9ee7))
* **enterprise:** include workflow run config ([8dd08744](https://github.com/garden-io/garden/commit/8dd08744))

### Code Refactoring

* rename Module to GardenModule for clarity ([d4b99e43](https://github.com/garden-io/garden/commit/d4b99e43))
* improve type-safety on plugin module handler definitions ([9bb9d42c](https://github.com/garden-io/garden/commit/9bb9d42c))
* **cli:** get rid of sywac dependency and improve CLI-code tests ([bd291d0d](https://github.com/garden-io/garden/commit/bd291d0d))
* **core:** start collecting SDK types and functions in one place ([5477e2f9](https://github.com/garden-io/garden/commit/5477e2f9))
* **core:** make Provider type slightly more explicit ([a49faf65](https://github.com/garden-io/garden/commit/a49faf65))

### Features

* add garden get doddi command ([9d1a6180](https://github.com/garden-io/garden/commit/9d1a6180))
* **config:** support YAML and JSON varfiles ([34cfd8ed](https://github.com/garden-io/garden/commit/34cfd8ed))
* **config:** allow explicitly declaring provider dependencies ([79f38268](https://github.com/garden-io/garden/commit/79f38268))
* **config:** add $merge key for merging maps together in configs ([921bb6fd](https://github.com/garden-io/garden/commit/921bb6fd))
* **dashboard:** add octant provider and dashboard integration ([#2006](https://github.com/garden-io/garden/issues/2006)) ([5c6273c1](https://github.com/garden-io/garden/commit/5c6273c1))
* **dashboard:** new garden dashboard command ([a5ad44ad](https://github.com/garden-io/garden/commit/a5ad44ad))
* **terraform:** add allowDestroy flags to automatically destroy stacks ([7d39ff2d](https://github.com/garden-io/garden/commit/7d39ff2d))
* **workflows:** add skip option for workflow steps ([d23ddbc0](https://github.com/garden-io/garden/commit/d23ddbc0))

### Improvements

* **dashboard:** render ANSI color in log views ([d8aaa606](https://github.com/garden-io/garden/commit/d8aaa606))
* **dashboard:** change font to Nunito Sans ([03381459](https://github.com/garden-io/garden/commit/03381459))
* **dashboard:** better error message handling for server errors ([e96ad4c4](https://github.com/garden-io/garden/commit/e96ad4c4))
* **k8s:** reduce usage of kubectl, use APIs directly ([5cdbcea2](https://github.com/garden-io/garden/commit/5cdbcea2))

<a name="v0.12.2"></a>
## [v0.12.2](https://github.com/garden-io/garden/compare/v0.12.1...v0.12.2) (2020-08-03)

### Bug Fixes

* **enterprise:** add project id to config dump ([c587de9e](https://github.com/garden-io/garden/commit/c587de9e))
* **k8s:** deploy util service if using kaniko ([#1963](https://github.com/garden-io/garden/issues/1963)) ([42203bb0](https://github.com/garden-io/garden/commit/42203bb0))
* **k8s:** fix hot reload path handling on Windows ([f0c3001d](https://github.com/garden-io/garden/commit/f0c3001d))
* **k8s:** incorrect paths when hot reloading helm modules ([cfe399c0](https://github.com/garden-io/garden/commit/cfe399c0))
* **k8s:** race condition caused error when connecting to rsync container ([e8fd9bc1](https://github.com/garden-io/garden/commit/e8fd9bc1))
* **k8s:** incorrect Service name used for port forwards ([4c7cf8cb](https://github.com/garden-io/garden/commit/4c7cf8cb))
* **kubernetes-module:** fix namespace handling ([f4cd7e6b](https://github.com/garden-io/garden/commit/f4cd7e6b))
* **terraform:** allow map outputs from modules ([ae06754f](https://github.com/garden-io/garden/commit/ae06754f))

### Features

* **cli:** add --var flag for setting individual variable values ([5ec3fd51](https://github.com/garden-io/garden/commit/5ec3fd51))
* **config:** add `contains` operator for template strings ([33d8275a](https://github.com/garden-io/garden/commit/33d8275a))
* **config:** allow multiple config files in same directory ([75af1752](https://github.com/garden-io/garden/commit/75af1752))
* **container:** set GARDEN_MODULE_VERSION build arg for all builds ([00365bcc](https://github.com/garden-io/garden/commit/00365bcc))
* **exec:** set GARDEN_MODULE_VERSION when running all commands ([245d70c1](https://github.com/garden-io/garden/commit/245d70c1))

### Improvements

* **core:** set smarter limits on concurrent graph actions ([029ab9cf](https://github.com/garden-io/garden/commit/029ab9cf))

<a name="v0.12.1"></a>
## [v0.12.1](https://github.com/garden-io/garden/compare/v0.12.0...v0.12.1) (2020-07-24)

### Bug Fixes

* **k8s:** correct kaniko immutability check ([f25fb516](https://github.com/garden-io/garden/commit/f25fb516))
* **local-k8s:** add 'docker-desktop' as supported context ([1b9d0d1d](https://github.com/garden-io/garden/commit/1b9d0d1d))

### Features

* **core:** throw workflow config errors on scan ([7e1acf8d](https://github.com/garden-io/garden/commit/7e1acf8d))
* **enterprise:** register workflow runs ([de072ac9](https://github.com/garden-io/garden/commit/de072ac9))
* **enterprise:** include env and ns in events ([3e4db5ce](https://github.com/garden-io/garden/commit/3e4db5ce))

### Improvements

* **kaniko:** allow configuring builder flags alongside image ([3541284b](https://github.com/garden-io/garden/commit/3541284b))

### Performance Improvements

* **git:** cache git exec results ([5dce8350](https://github.com/garden-io/garden/commit/5dce8350))

<a name="v0.12.0"></a>
## [v0.12.0](https://github.com/garden-io/garden/compare/v0.11.14...v0.12.0) (2020-06-29)

### Bug Fixes

* properly connect to remote in proxy ([2a8b748f](https://github.com/garden-io/garden/commit/2a8b748f))
* add tests for config contexts (TBS) ([48bb1afd](https://github.com/garden-io/garden/commit/48bb1afd))
* **build-sync:** randomly choose pod for rsync ([be816791](https://github.com/garden-io/garden/commit/be816791))
* **cli:** don't show analytics message when telemetry is disabled ([642cfe8e](https://github.com/garden-io/garden/commit/642cfe8e))
* **container:** install ssh to base image ([#1890](https://github.com/garden-io/garden/issues/1890)) ([dbc601b9](https://github.com/garden-io/garden/commit/dbc601b9))
* **container:** extraFlags weren't used when building in-cluster ([1bbaad6c](https://github.com/garden-io/garden/commit/1bbaad6c))
* **docker:** remove default timeout, fix publish timeouts ([71576de3](https://github.com/garden-io/garden/commit/71576de3))
* **docs:** fix typo in FAQ ([5062c9ec](https://github.com/garden-io/garden/commit/5062c9ec))
* **enterprise:** use noPlatform for system Garden ([496d2696](https://github.com/garden-io/garden/commit/496d2696))
* **enterprise:** fixes to login & secrets logic ([22760447](https://github.com/garden-io/garden/commit/22760447))
* **enterprise:** wait for event stream to flush ([f8854c97](https://github.com/garden-io/garden/commit/f8854c97))
* **enterprise:** use correct body param when streaming events ([e8afa003](https://github.com/garden-io/garden/commit/e8afa003))
* **enterprise:** fix final log entry flush ([6f684629](https://github.com/garden-io/garden/commit/6f684629))
* **examples:** fix local exec example ([90d9b584](https://github.com/garden-io/garden/commit/90d9b584))
* **helm:** allow runtime templates in helm module values field ([346e776f](https://github.com/garden-io/garden/commit/346e776f))
* **k8s:** make hot reloading respect excludes ([0b61ddd1](https://github.com/garden-io/garden/commit/0b61ddd1))
* **k8s:** make helm & k8s tasks respect timeouts ([8b4a4b86](https://github.com/garden-io/garden/commit/8b4a4b86))
* **k8s:** ensure rendered helm chart contain runtime values ([#1882](https://github.com/garden-io/garden/issues/1882)) ([26a87b9f](https://github.com/garden-io/garden/commit/26a87b9f))
* **kaniko:** correctly set container command when using kaniko w/o socat ([594f7d32](https://github.com/garden-io/garden/commit/594f7d32))
* **workflows:** abort if step cmd returns errors ([2602122b](https://github.com/garden-io/garden/commit/2602122b))
* **workflows:** fix some logging issues in run workflows command ([eb4c341b](https://github.com/garden-io/garden/commit/eb4c341b))

### Code Refactoring

* **pod-utils:** fold getDeploymentPodName to only one function ([447b0f55](https://github.com/garden-io/garden/commit/447b0f55))

### Features

* added minimist-based CLI arg + opt parsing ([b6e950b6](https://github.com/garden-io/garden/commit/b6e950b6))
* add --resolve=partial option to get config command ([6c113071](https://github.com/garden-io/garden/commit/6c113071))
* add garden-dev/garden-azure docker image ([#1893](https://github.com/garden-io/garden/issues/1893)) ([1a08593e](https://github.com/garden-io/garden/commit/1a08593e))
* **commands:** add fields to get config output ([26334f60](https://github.com/garden-io/garden/commit/26334f60))
* **config:** allow environment[].variables to reference top-level vars ([#1910](https://github.com/garden-io/garden/issues/1910)) ([bd872718](https://github.com/garden-io/garden/commit/bd872718))
* **conftest:** add combine option to conftest module ([9fdf6c73](https://github.com/garden-io/garden/commit/9fdf6c73))
* **core:** emit runtime status events ([841285ee](https://github.com/garden-io/garden/commit/841285ee))
* **core:** allow custom SQLite db directory ([ede0b69f](https://github.com/garden-io/garden/commit/ede0b69f))
* **core:** add projectId to get config cmd output ([e6f0acf9](https://github.com/garden-io/garden/commit/e6f0acf9))
* **core:** workflows for sequencing commands ([bb304cfe](https://github.com/garden-io/garden/commit/bb304cfe))
* **core:** support namespaces natively at the framework level ([e5023f7e](https://github.com/garden-io/garden/commit/e5023f7e))
* **core:** pre-fetch provider tools and make tools a native feature ([#1858](https://github.com/garden-io/garden/issues/1858)) ([95c2aea1](https://github.com/garden-io/garden/commit/95c2aea1))
* **enterprise:** include log level when streaming ([3e88a03d](https://github.com/garden-io/garden/commit/3e88a03d))
* **exec:** add script option to exec provider configuration ([35a175bb](https://github.com/garden-io/garden/commit/35a175bb))
* **k8s:** support immutable build success ([1d4dcd78](https://github.com/garden-io/garden/commit/1d4dcd78))
* **kaniko:** make kaniko image configurable in provider config ([66e6974c](https://github.com/garden-io/garden/commit/66e6974c))
* **kaniko:** pass `extraFlags` to kaniko builders ([deaab079](https://github.com/garden-io/garden/commit/deaab079))
* **kaniko:** when using remote registry do not run the proxy ([547d9ba8](https://github.com/garden-io/garden/commit/547d9ba8))
* **platform:** support non-interactive auth ([b0205936](https://github.com/garden-io/garden/commit/b0205936))
* **template:** support nested expressions, maps and numeric keys ([578e5552](https://github.com/garden-io/garden/commit/578e5552))
* **workflows:** add duration to step events ([07d80598](https://github.com/garden-io/garden/commit/07d80598))
* **workflows:** add namespacing support ([7eefa2ea](https://github.com/garden-io/garden/commit/7eefa2ea))
* **workflows:** support referencing outputs from previous steps ([d637b362](https://github.com/garden-io/garden/commit/d637b362))
* **workflows:** improved log & event streaming ([418506c2](https://github.com/garden-io/garden/commit/418506c2))
* **workflows:** add support for arbitrary user scripts in workflows ([d7b76a41](https://github.com/garden-io/garden/commit/d7b76a41))
* **workflows:** allow writing files ahead of workflow execution ([12e8b247](https://github.com/garden-io/garden/commit/12e8b247))

### Improvements

* **core:** always require a namespace and simplify env config ([#1900](https://github.com/garden-io/garden/issues/1900)) ([a783adc0](https://github.com/garden-io/garden/commit/a783adc0))
* **core:** don't respect .gitignore files by default ([c7ef4533](https://github.com/garden-io/garden/commit/c7ef4533))
* **k8s:** upgrade kaniko to v0.22 ([#1834](https://github.com/garden-io/garden/issues/1834)) ([b3eb25d5](https://github.com/garden-io/garden/commit/b3eb25d5))
* **template:** show available keys when key is not found ([e6bb2cb3](https://github.com/garden-io/garden/commit/e6bb2cb3))
* **terraform:** support v0.12.26 and remove old versions ([c84564e2](https://github.com/garden-io/garden/commit/c84564e2))

### Performance Improvements

* **analytics:** don't wait for event tracks ([1ee05bef](https://github.com/garden-io/garden/commit/1ee05bef))
* **core:** cache provider statuses for faster successive startup ([db72f2a8](https://github.com/garden-io/garden/commit/db72f2a8))
* **k8s:** remove Helm 2 support and migration flow ([b9e5f74e](https://github.com/garden-io/garden/commit/b9e5f74e))

### BREAKING CHANGE


The default namespace in the `kubernetes` provider is now
`<project name>.<environment namespace>` (previously it was just the
project name). Users need to override this to `"${project.name}"` if
they would like to revert to the previous default.

The JSON/YAML output from the build, deploy and test commands has been
modified. The prior format is now nested under the `graphResults` key,
and new more structured fields have been added, which we recommend using
when possible.

Similarly, the outputs from the `run` commands have been modified. The
`result` key now contains the data from the previous format, along with
some additional metadata.

We no longer automatically detect and migrate from Helm 2.x and Tiller.

All Terraform versions below 0.12.26 have now been removed and are no
longer supported. If you have explicitly set a Terraform version in your
terraform provider config, you need to update that to "0.12.26" or
remove the field.

Hot reloading now uses the tracked file list for its sync, similarly to
how the build sync does.

This means that untracked files will no longer be synced by hot
reloading.

Garden no longer respects `.gitignore` files by default now. If you'd
like to retain the previous default behavior, you can explicitly set
`dotIgnoreFiles: [.gitignore, .gardenignore]` in your project configs.
If you already have `dotIgnoreFiles` set in your config, no change is
necessary.

<a name="v0.11.14"></a>
## [v0.11.14](https://github.com/garden-io/garden/compare/v0.11.13...v0.11.14) (2020-05-13)

### Bug Fixes

* **k8s:** error in cleanup-cluster-registry command and added test ([ce4af74b](https://github.com/garden-io/garden/commit/ce4af74b))

### Features

* **core:** provide secrets to template strings ([a6c89e2e](https://github.com/garden-io/garden/commit/a6c89e2e))
* **platform:** added id and domain to projects ([dc6f27b6](https://github.com/garden-io/garden/commit/dc6f27b6))

### Improvements

* **k8s:** upgrade helm to v3.2.1 ([#1826](https://github.com/garden-io/garden/issues/1826)) ([df9e4e47](https://github.com/garden-io/garden/commit/df9e4e47))
* **k8s:** update in-cluster docker registry to 2.7.1 ([a2f38aee](https://github.com/garden-io/garden/commit/a2f38aee))
* **k8s:** bump kaniko to v0.21 ([#1820](https://github.com/garden-io/garden/issues/1820)) ([15390ff1](https://github.com/garden-io/garden/commit/15390ff1))
* **k8s:** upgrade kaniko version ([#1817](https://github.com/garden-io/garden/issues/1817)) ([334ae831](https://github.com/garden-io/garden/commit/334ae831))

<a name="v0.11.13"></a>
## [v0.11.13](https://github.com/garden-io/garden/compare/v0.11.12...v0.11.13) (2020-04-22)

### Bug Fixes

* **commands:** ensure get config returns disabled configs (by default) ([e4569798](https://github.com/garden-io/garden/commit/e4569798))
* **k8s:** artifact logs ([7fd02d0e](https://github.com/garden-io/garden/commit/7fd02d0e))
* **k8s:** only copy artifacts once ([6dcbb61f](https://github.com/garden-io/garden/commit/6dcbb61f))
* **platform:** fix login/logout control flow ([8f3defd5](https://github.com/garden-io/garden/commit/8f3defd5))
* **template:** fix imprecise error when key on nested context is missing ([2af9b0bb](https://github.com/garden-io/garden/commit/2af9b0bb))

### Features

* **k8s:** run a persistent skopeo daemon ([9ddc749d](https://github.com/garden-io/garden/commit/9ddc749d))

<a name="v0.11.12"></a>
## [v0.11.12](https://github.com/garden-io/garden/compare/v0.11.11...v0.11.12) (2020-02-10)

### Bug Fixes

* **chore:** fix spurious logline from busybox ([db7dd294](https://github.com/garden-io/garden/commit/db7dd294))
* **cli:** properly handle -- arg for provider commands ([d96ab9d2](https://github.com/garden-io/garden/commit/d96ab9d2))
* **core:** skip invalid yaml by default ([5a44da51](https://github.com/garden-io/garden/commit/5a44da51))
* **core:** missing dep detection in ConfigGraph ([006ad98c](https://github.com/garden-io/garden/commit/006ad98c))
* **core:** better error messages for invalid YAML ([6720b95f](https://github.com/garden-io/garden/commit/6720b95f))
* **k8s:** don't truncate logs in task/test runs ([68047339](https://github.com/garden-io/garden/commit/68047339))
* **k8s:** automatic include for helm modules should include chartPath ([88c9d26a](https://github.com/garden-io/garden/commit/88c9d26a))
* **platform:** use noProject for login & logout ([13826ac6](https://github.com/garden-io/garden/commit/13826ac6))
* **platform:** fixes to token validation logic ([a1651695](https://github.com/garden-io/garden/commit/a1651695))
* **terraform:** fix stdin handling in commands ([4eb30b31](https://github.com/garden-io/garden/commit/4eb30b31))
* **terraform:** more sensible timeouts + remove timeout on plugin cmds ([ed642090](https://github.com/garden-io/garden/commit/ed642090))

### Features

* **core:** add event and log streaming ([ffc10943](https://github.com/garden-io/garden/commit/ffc10943))

<a name="v0.11.11"></a>
## [v0.11.11](https://github.com/garden-io/garden/compare/v0.11.10...v0.11.11) (2020-04-03)

### Bug Fixes

* **cmd:** better error messages in get task-result ([e44c4608](https://github.com/garden-io/garden/commit/e44c4608))
* **conftest:** ensure policy path is valid POSIX on Windows ([ee12c80d](https://github.com/garden-io/garden/commit/ee12c80d))
* **core:** fix watch task logic for sourceModules ([#1756](https://github.com/garden-io/garden/issues/1756)) ([1f189bb9](https://github.com/garden-io/garden/commit/1f189bb9))
* **dashboard:** fix normalize-url to version 4 ([7f34a57b](https://github.com/garden-io/garden/commit/7f34a57b))
* **k8s:** intermittent errors with volume mounts in build-sync pods ([e6efba8c](https://github.com/garden-io/garden/commit/e6efba8c))
* **k8s:** cleanup kaniko pod ([#1757](https://github.com/garden-io/garden/issues/1757)) ([bb923adc](https://github.com/garden-io/garden/commit/bb923adc))
* **k8s:** duplicate text in some error logs ([df7fdf05](https://github.com/garden-io/garden/commit/df7fdf05))
* **k8s:** warn instead of erroring when remote image status check fails ([534698dc](https://github.com/garden-io/garden/commit/534698dc))

### Features

* **cli:** print basic profiling data when GARDEN_ENABLE_PROFILING=1 ([99b2f045](https://github.com/garden-io/garden/commit/99b2f045))
* **k8s:** expose nodeSelector field on system PodSpecs ([99390140](https://github.com/garden-io/garden/commit/99390140))
* **platform:** add client login to CLI ([fabc4720](https://github.com/garden-io/garden/commit/fabc4720))

### Improvements

* **core:** make module resolution faster to reduce startup time ([fbebc7dc](https://github.com/garden-io/garden/commit/fbebc7dc))
* **k8s:** add default tolerations to system services ([63f0a04c](https://github.com/garden-io/garden/commit/63f0a04c))
* **k8s:** add more metadata env vars to container Pod specs ([e1d4bf43](https://github.com/garden-io/garden/commit/e1d4bf43))
* **k8s:** update socat image used for registry proxies ([ec0c99d7](https://github.com/garden-io/garden/commit/ec0c99d7))

<a name="v0.11.10"></a>
## [v0.11.10](https://github.com/garden-io/garden/compare/v0.11.9...v0.11.10) (2020-03-25)

### Bug Fixes

* **k8s:** error when getting build status from microk8s cluster ([3da79ada](https://github.com/garden-io/garden/commit/3da79ada))
* **k8s:** ensure non-zero exit code if test/task with artifacts fails ([e4f78c88](https://github.com/garden-io/garden/commit/e4f78c88))
* **k8s:** incorrect schema for persistentvolumeclaim dependencies field ([3aee56b8](https://github.com/garden-io/garden/commit/3aee56b8))
* **k8s:** if the output is json, stringify it ([#1728](https://github.com/garden-io/garden/issues/1728)) ([d62890d8](https://github.com/garden-io/garden/commit/d62890d8))

### Features

* only use socat with incluster registry ([4baf879b](https://github.com/garden-io/garden/commit/4baf879b))
* **cli:** add experimental fullscreen logger type ([038328ae](https://github.com/garden-io/garden/commit/038328ae))
* **config:** allow any objects and arrays in project variables ([6c2df1b1](https://github.com/garden-io/garden/commit/6c2df1b1))
* **k8s:** add pull-image command ([#1681](https://github.com/garden-io/garden/issues/1681)) ([8f6d3c25](https://github.com/garden-io/garden/commit/8f6d3c25))

### Improvements

* **commands:** more consistent outputs for run commands ([a24b343f](https://github.com/garden-io/garden/commit/a24b343f))

<a name="v0.11.9"></a>
## [v0.11.9](https://github.com/garden-io/garden/compare/v0.11.8...v0.11.9) (2020-03-16)

### Bug Fixes

* update .nvmrc ([#1715](https://github.com/garden-io/garden/issues/1715)) ([1bf7da9f](https://github.com/garden-io/garden/commit/1bf7da9f))
* **cli:** configure provider/env correctly in `garden plugins` command ([41aacb2c](https://github.com/garden-io/garden/commit/41aacb2c))
* **cli:** ignore --env flag for commands that don't use a project config ([ccfd8ff3](https://github.com/garden-io/garden/commit/ccfd8ff3))
* **core:** improved circular dependency detection ([4eea9bdb](https://github.com/garden-io/garden/commit/4eea9bdb))
* **k8s:** pass custom kubeconfig path to stern ([cf040870](https://github.com/garden-io/garden/commit/cf040870))
* **k8s:** don't attempt to cleanup registry when using external registry ([9d520e0d](https://github.com/garden-io/garden/commit/9d520e0d))

<a name="v0.11.8"></a>
## [v0.11.8](https://github.com/garden-io/garden/compare/v0.11.7...v0.11.8) (2020-03-03)

### Bug Fixes

* **cli:** fix empty response handling in call cmd ([7d8b7f65](https://github.com/garden-io/garden/commit/7d8b7f65))
* **k8s:** error in build status check when using kaniko ([7d3ebb93](https://github.com/garden-io/garden/commit/7d3ebb93))

<a name="v0.11.7"></a>
## [v0.11.7](https://github.com/garden-io/garden/compare/v0.11.6...v0.11.7) (2020-03-11)

### Bug Fixes

* **cli:** return error in garden run task if task fails ([#1669](https://github.com/garden-io/garden/issues/1669)) ([f5cf81ca](https://github.com/garden-io/garden/commit/f5cf81ca))
* **k8s:** issues with private registry auth and kaniko build status ([011629ca](https://github.com/garden-io/garden/commit/011629ca))
* **k8s:** better error when manifest has no apiVersion ([ef18a6c6](https://github.com/garden-io/garden/commit/ef18a6c6))
* **task-graph:** don't include results from other batches in output ([3aed9908](https://github.com/garden-io/garden/commit/3aed9908))

### Features

* **k8s:** add ECR credential helper to in-cluster docker builder ([6c0d3d39](https://github.com/garden-io/garden/commit/6c0d3d39))
* **terraform:** add plugin commands for terraform apply and plan ([b4283dd3](https://github.com/garden-io/garden/commit/b4283dd3))

### Improvements

* allow setting cred helpers in ImagePullSecrets ([b293fe2c](https://github.com/garden-io/garden/commit/b293fe2c))

<a name="v0.11.6"></a>
## [v0.11.6](https://github.com/garden-io/garden/compare/v0.11.5...v0.11.6) (2020-03-06)

### Bug Fixes

* issues with running HTTPS requests through HTTP proxy ([5cd1864a](https://github.com/garden-io/garden/commit/5cd1864a))
* **commands:** don't use default port in serve cmd ([4babaefb](https://github.com/garden-io/garden/commit/4babaefb))
* **container:** strip quotes from Dockerfile paths when setting includes ([49bb9b86](https://github.com/garden-io/garden/commit/49bb9b86))
* **k8s:** error when task logs were longer than 500kB ([10327a12](https://github.com/garden-io/garden/commit/10327a12))
* **k8s:** error when helm returned empty YAML documents ([669d70a2](https://github.com/garden-io/garden/commit/669d70a2))

### Improvements

* **k8s:** update kaniko to v0.17.1 ([70340e80](https://github.com/garden-io/garden/commit/70340e80))
* **k8s:** default in-cluster registry namespace to project name ([7ed4648e](https://github.com/garden-io/garden/commit/7ed4648e))
* **template:** allow template expression in nested strings ([a383459d](https://github.com/garden-io/garden/commit/a383459d))

<a name="v0.11.5"></a>
## [v0.11.5](https://github.com/garden-io/garden/compare/v0.11.4...v0.11.5) (2020-02-25)

### Bug Fixes

* **cli:** create command didn't work from release build ([51806043](https://github.com/garden-io/garden/commit/51806043))
* **cli:** edge-case error when writing error logs ([29fe3aa3](https://github.com/garden-io/garden/commit/29fe3aa3))
* **container:** don't error on init if docker server can't be reached ([4bf8aab9](https://github.com/garden-io/garden/commit/4bf8aab9))
* **core:** fix to dependency logic in dev command ([ef20e929](https://github.com/garden-io/garden/commit/ef20e929))
* **k8s:** include value files in default Helm include clause ([24278058](https://github.com/garden-io/garden/commit/24278058))
* **k8s:** issues with querying registries for image tags ([71f41d45](https://github.com/garden-io/garden/commit/71f41d45))

### Features

* **core:** add get linked-repos command ([5145d3fc](https://github.com/garden-io/garden/commit/5145d3fc))

<a name="v0.11.4"></a>
## [v0.11.4](https://github.com/garden-io/garden/compare/v0.11.3...v0.11.4) (2020-02-21)

### Bug Fixes

* **Windows:** don't always install docker-for-windows ([11c1dfc7](https://github.com/garden-io/garden/commit/11c1dfc7))
* **cli:** minor fixes for garden create module command ([97afb223](https://github.com/garden-io/garden/commit/97afb223))
* **core:** ensure task outputs are logged to terminal + fix test ([f4b5dfcd](https://github.com/garden-io/garden/commit/f4b5dfcd))
* **core:** fix to task deps for DeployTask ([9b35d744](https://github.com/garden-io/garden/commit/9b35d744))
* **core:** allow referencing disabled providers in template strings ([fca3bd85](https://github.com/garden-io/garden/commit/fca3bd85))
* **core:** tasks should not implicitly run when getting service status ([9ab9d8a6](https://github.com/garden-io/garden/commit/9ab9d8a6))
* **core:** fix concurrency bug in task graph ([500ccc25](https://github.com/garden-io/garden/commit/500ccc25))
* **core:** remove StageBuildTask from GetServiceStatusTask dependencies ([a89d2e54](https://github.com/garden-io/garden/commit/a89d2e54))
* **k8s:** include imagePullSecrets when running task and test Pods ([10df10e9](https://github.com/garden-io/garden/commit/10df10e9))
* **k8s:** fix handling of missing `sh` when copying artifacts from pods ([d0698b41](https://github.com/garden-io/garden/commit/d0698b41))
* **k8s:** fix build-sync Pod crash loop issue ([86ee925c](https://github.com/garden-io/garden/commit/86ee925c))
* **k8s:** imagePullSecrets weren't copied to the project namespace ([86174f9d](https://github.com/garden-io/garden/commit/86174f9d))
* **k8s:** don't throw error when test/task artifact is missing after run ([8a246231](https://github.com/garden-io/garden/commit/8a246231))
* **k8s:** fixed handling of timeouts when artifacts are being copied ([ff4097b1](https://github.com/garden-io/garden/commit/ff4097b1))
* **k8s:** retrieving logs would sometimes fail after deployment rollback ([0409e68b](https://github.com/garden-io/garden/commit/0409e68b))
* **k8s:** tasks and tests would sometimes return empty logs ([d0b025c3](https://github.com/garden-io/garden/commit/d0b025c3))
* **task-graph:** don't re-run failed tasks ([1eda1d10](https://github.com/garden-io/garden/commit/1eda1d10))
* **task-graph:** fix to dependant cancellation ([626f1093](https://github.com/garden-io/garden/commit/626f1093))
* **terraform:** include module check for terraform init ([183f66a9](https://github.com/garden-io/garden/commit/183f66a9))
* **terraform:** increase init timeout ([#1594](https://github.com/garden-io/garden/issues/1594)) ([0ddcca23](https://github.com/garden-io/garden/commit/0ddcca23))
* **terraform:** ensure correct init root is validate + add logs ([da87fd19](https://github.com/garden-io/garden/commit/da87fd19))

### Code Refactoring

* wrap all Joi schemas in callbacks to avoid circular dep issues ([b3228667](https://github.com/garden-io/garden/commit/b3228667))
* **dashboard:** use immer for setting ui state ([15c116c5](https://github.com/garden-io/garden/commit/15c116c5))

### Features

* add persistentvolumeclaim module type and volumes for containers ([4d6bfeed](https://github.com/garden-io/garden/commit/4d6bfeed))
* allow disabling result caching for tasks that support it ([1d58eb8b](https://github.com/garden-io/garden/commit/1d58eb8b))
* **cli:** add `garden create project/module` commands ([def652cb](https://github.com/garden-io/garden/commit/def652cb))
* **core:** improved task graph concurrency ([1a2f69ae](https://github.com/garden-io/garden/commit/1a2f69ae))
* **distribution:** add container image baked with AWS CLI ([adb9ab20](https://github.com/garden-io/garden/commit/adb9ab20))
* **template:** add optional suffix, to allow undefined values ([1eb0a926](https://github.com/garden-io/garden/commit/1eb0a926))

### Improvements

* **cli:** output error details to console with log level 5 ([0c69b6ed](https://github.com/garden-io/garden/commit/0c69b6ed))
* **k8s:** use deploymentRegistry with in-cluster building ([ef2ab151](https://github.com/garden-io/garden/commit/ef2ab151))
* **maven-container:** add useDefaultDockerfile field ([1d741f35](https://github.com/garden-io/garden/commit/1d741f35))
* **template:** allow using objects as tests in conditionals ([98f06895](https://github.com/garden-io/garden/commit/98f06895))
* **template:** better error when a template key is not found ([b2589de8](https://github.com/garden-io/garden/commit/b2589de8))

<a name="v0.11.3"></a>
## [v0.11.3](https://github.com/garden-io/garden/compare/v0.11.2...v0.11.3) (2020-02-04)

### Bug Fixes

* **cli:** add exclude-disabled option to get config command ([353a05e6](https://github.com/garden-io/garden/commit/353a05e6))
* **k8s:** provider init errors weren't handled properly ([423f8e06](https://github.com/garden-io/garden/commit/423f8e06))


<a name="v0.11.2"></a>
## [v0.11.2](https://github.com/garden-io/garden/compare/v0.11.1...v0.11.2) (2020-01-29)

### Bug Fixes

* **core:** make test task deps hot-reload aware ([4af27b10](https://github.com/garden-io/garden/commit/4af27b10))
* **k8s:** hash configuration annotation ([9b6e2ad7](https://github.com/garden-io/garden/commit/9b6e2ad7))
* **k8s:** ensure system namespace exists before using it ([e1d1c8de](https://github.com/garden-io/garden/commit/e1d1c8de))
* **k8s:** ensure generated pod names are always unique ([493a7874](https://github.com/garden-io/garden/commit/493a7874))

### Features

* **core:** add project outputs and `garden get outputs` command ([475e8188](https://github.com/garden-io/garden/commit/475e8188))
* **k8s:** add namespace parameter to helm and kubernetes modules ([b23eeaaf](https://github.com/garden-io/garden/commit/b23eeaaf))
* **k8s:** add test and task support for kubernetes module type ([#1530](https://github.com/garden-io/garden/issues/1530)) ([469453e7](https://github.com/garden-io/garden/commit/469453e7))


<a name="v0.11.1"></a>
## [v0.11.1](https://github.com/garden-io/garden/compare/v0.11.0...v0.11.1) (2020-01-24)

### Bug Fixes

* analytics make sure first event is flushed ([c4d69351](https://github.com/garden-io/garden/commit/c4d69351))
* **build:** error in alpine container image builds ([d87ea71c](https://github.com/garden-io/garden/commit/d87ea71c))
* **container:** more verbose logging during builds ([131b10f4](https://github.com/garden-io/garden/commit/131b10f4))
* **core:** allow git URLs not ending in .git ([542e205f](https://github.com/garden-io/garden/commit/542e205f))
* **core:** include hidden files when using include filters ([320eb63f](https://github.com/garden-io/garden/commit/320eb63f))
* **core:** allow unknown in task & test results ([c6a0fed9](https://github.com/garden-io/garden/commit/c6a0fed9))
* **docs:** fix incorrect link in guide ([79f35290](https://github.com/garden-io/garden/commit/79f35290))
* **helm:** only hot reload serviceResource ([1235fc71](https://github.com/garden-io/garden/commit/1235fc71))
* **k8s:** reconnect port-forwards automatically ([553a34a4](https://github.com/garden-io/garden/commit/553a34a4))
* **k8s:** handle 404 exception when tagging image for deletion ([#1485](https://github.com/garden-io/garden/issues/1485)) ([f7c5ed47](https://github.com/garden-io/garden/commit/f7c5ed47))
* **k8s:** fix failing tasks not throwing errors ([0d204c23](https://github.com/garden-io/garden/commit/0d204c23))
* **log:** updated to stern from kubectl ([#1437](https://github.com/garden-io/garden/issues/1437)) ([138e3dfc](https://github.com/garden-io/garden/commit/138e3dfc))
* **logger:** wrap words when splitting fancy log lines ([3c3c7d2b](https://github.com/garden-io/garden/commit/3c3c7d2b))
* **test:** improve error logging in e2e tests ([c308f466](https://github.com/garden-io/garden/commit/c308f466))

### Code Refactoring

* update Joi library ([f35d1a5d](https://github.com/garden-io/garden/commit/f35d1a5d))
* **container:** revert build logs log level to debug ([f7fc5f50](https://github.com/garden-io/garden/commit/f7fc5f50))
* **logger:** add dataFormat to LogEntry ([bac4f746](https://github.com/garden-io/garden/commit/bac4f746))
* **test:** added tslint rule + removed js ([8271fc4a](https://github.com/garden-io/garden/commit/8271fc4a))

### Features

* **core:** allow disabling modules, services, tests + tasks in configs ([#1515](https://github.com/garden-io/garden/issues/1515)) ([54d74ccb](https://github.com/garden-io/garden/commit/54d74ccb))
* **core:** remember IP per service for forwards on supported platforms ([1bbcf490](https://github.com/garden-io/garden/commit/1bbcf490))

### Improvements

* allow to specify release to install ([699fd379](https://github.com/garden-io/garden/commit/699fd379))
* switch to Node.js 12 ([4c51aaef](https://github.com/garden-io/garden/commit/4c51aaef))
* **cli:** use terminal-kit for better terminal compatibility ([4030881a](https://github.com/garden-io/garden/commit/4030881a))
* **core:** detect rsync and ensure the version is recent enough ([f3df17dd](https://github.com/garden-io/garden/commit/f3df17dd))
* **dashboard:** default to port 9777 when available ([add9bc63](https://github.com/garden-io/garden/commit/add9bc63))


<a name="v0.11.0"></a>
## [v0.11.0](https://github.com/garden-io/garden/compare/v0.10.16...v0.11.0) (2020-01-13)

### Bug Fixes

* failing init if remote is not set ([938bb200](https://github.com/garden-io/garden/commit/938bb200))
* force anlytics events queue flush ([89ea096c](https://github.com/garden-io/garden/commit/89ea096c))
* occasional unhelpful error messages when shelling out ([92849a01](https://github.com/garden-io/garden/commit/92849a01))
* remove resources only when tiller not deployed ([b2b30b17](https://github.com/garden-io/garden/commit/b2b30b17))
* **build:** ensure that exec modules are rebuilt on when garden is run ([4d2cccea](https://github.com/garden-io/garden/commit/4d2cccea))
* **build:** validate helm modules at build rather than configure phase ([7551646a](https://github.com/garden-io/garden/commit/7551646a))
* **cli:** enable running 'config analytics-enabled' with no project ([cc151a3a](https://github.com/garden-io/garden/commit/cc151a3a))
* **cli:** ensure 'noProject' commands run in invalid projects ([4e7ff830](https://github.com/garden-io/garden/commit/4e7ff830))
* **config:** detect overlap after resolving module configs ([3fd520e9](https://github.com/garden-io/garden/commit/3fd520e9))
* **config:** do not set default include if exclude is set + add tests ([5f7dd186](https://github.com/garden-io/garden/commit/5f7dd186))
* **core:** use fresh statuses in get status cmd ([b0ebf22f](https://github.com/garden-io/garden/commit/b0ebf22f))
* **core:** fix empty runtimeContext check ([0b2eae5e](https://github.com/garden-io/garden/commit/0b2eae5e))
* **core:** error when attempting to forward to restricted local port ([e6a103bf](https://github.com/garden-io/garden/commit/e6a103bf))
* **core:** extraneous build step in stack graph when no build is needed ([f452c00e](https://github.com/garden-io/garden/commit/f452c00e))
* **core:** ensure builds are staged when module has no build handler ([c4c13d23](https://github.com/garden-io/garden/commit/c4c13d23))
* **dashboard:** hide ingress view when showing task/test results ([6879bf1c](https://github.com/garden-io/garden/commit/6879bf1c))
* **docs:** fix dashboard README ([5152dded](https://github.com/garden-io/garden/commit/5152dded))
* **k8s:** use configured ingress ports when installing nginx ([919e4f35](https://github.com/garden-io/garden/commit/919e4f35))
* **k8s:** only cleanup generated namespaces ([c94b2ca8](https://github.com/garden-io/garden/commit/c94b2ca8))
* **k8s:** fix issues with helm 2to3 migration ([4b3629bf](https://github.com/garden-io/garden/commit/4b3629bf))
* **k8s:** helm migration issue with non-deployed releases ([d97adf78](https://github.com/garden-io/garden/commit/d97adf78))
* **k8s:** timeout error in cleanup-cluster-registry script ([b5451e3b](https://github.com/garden-io/garden/commit/b5451e3b))
* **k8s:** in-cluster registry updates would hang with RWO volumes ([fd264141](https://github.com/garden-io/garden/commit/fd264141))
* **k8s:** ensure Garden can upgrade garden-nginx release ([b244c8e0](https://github.com/garden-io/garden/commit/b244c8e0))
* **k8s:** play nice with Helm 2 (Tiller) when users still need it ([8f803c3c](https://github.com/garden-io/garden/commit/8f803c3c))
* **k8s:** ensure helm migration works on Windows ([2771a982](https://github.com/garden-io/garden/commit/2771a982))
* **k8s:** don't throw init error if garden-system services are modified ([0aff683e](https://github.com/garden-io/garden/commit/0aff683e))
* **k8s:** uninstall-garden-services command now works more reliably ([a9671543](https://github.com/garden-io/garden/commit/a9671543))
* **k8s:** error when running cluster-init command ([dd94e05b](https://github.com/garden-io/garden/commit/dd94e05b))
* **k8s:** default to NFS for in-cluster builder storage for local k8s ([10b90e14](https://github.com/garden-io/garden/commit/10b90e14))
* **k8s:** make sure Helm 3 migration is run for project namespaces ([70403730](https://github.com/garden-io/garden/commit/70403730))
* **openfaas:** fix issue in deployment retry handler ([f6e2cf3a](https://github.com/garden-io/garden/commit/f6e2cf3a))
* **vcs:** ensure module versions are stable between runtimes ([3b438a4e](https://github.com/garden-io/garden/commit/3b438a4e))
* **watcher:** fix segfault on Mac when reloading config ([265696e9](https://github.com/garden-io/garden/commit/265696e9))

### Code Refactoring

* **core:** allow plugins to augment the module graph ([b2509e9c](https://github.com/garden-io/garden/commit/b2509e9c))
* **k8s:** avoid building Helm chart before getting deploy status ([aa06e8e3](https://github.com/garden-io/garden/commit/aa06e8e3))

### Features

* add a migration command for migrating from v0.10 to v0.11 ([765b324e](https://github.com/garden-io/garden/commit/765b324e))
* hadolint provider ([715abe06](https://github.com/garden-io/garden/commit/715abe06))
* **core:** use service's port when forwarding to localhost if available ([26bbeca3](https://github.com/garden-io/garden/commit/26bbeca3))
* **k8s:** add support for KinD ([87a69787](https://github.com/garden-io/garden/commit/87a69787))
* **providers:** add conftest providers ([da24e775](https://github.com/garden-io/garden/commit/da24e775))

### Improvements

* set default include on Helm modules ([fca600dd](https://github.com/garden-io/garden/commit/fca600dd))
* **analytics:** improve the data collection ([#1438](https://github.com/garden-io/garden/issues/1438)) ([04ffbbe6](https://github.com/garden-io/garden/commit/04ffbbe6))
* **cli:** remove `garden init` command ([3f9da06c](https://github.com/garden-io/garden/commit/3f9da06c))
* **container:** automatically set include field based on config ([7cef10eb](https://github.com/garden-io/garden/commit/7cef10eb))
* **core:** update to get-port with restricted port fix ([ca0992bb](https://github.com/garden-io/garden/commit/ca0992bb))
* **core:** allow relative symlinks within module root for builds ([f7449e17](https://github.com/garden-io/garden/commit/f7449e17))
* **hadolint:** log one-line warning message when applicable ([08b86968](https://github.com/garden-io/garden/commit/08b86968))
* **hadolint:** gracefully handle conflicting modules and names ([600bedfb](https://github.com/garden-io/garden/commit/600bedfb))
* **k8s:** set --atomic flag on helm upgrade ([7a9ed310](https://github.com/garden-io/garden/commit/7a9ed310))
* **k8s:** update bundled nginx controller version ([40729a46](https://github.com/garden-io/garden/commit/40729a46))
* **k8s:** switch to Helm 3 and remove Tiller ([a6940e0a](https://github.com/garden-io/garden/commit/a6940e0a))
* **k8s:** auto-set include field on kubernetes module type ([03033ba4](https://github.com/garden-io/garden/commit/03033ba4))
* **k8s:** stop bundling kubernetes-dashboard in garden-system ([e3d32e27](https://github.com/garden-io/garden/commit/e3d32e27))

### BREAKING CHANGE


If not set by the user, the `include` field on Helm modules now defaults to:

```javascript
["*", "charts/**/*", "templates/**/*"]
```

if the module has local chart sources, otherwise to:

```javascript
["*", "charts/**/*", "templates/**/*"]
```

Previously, Helm modules would simply include all content under the
module path.

If your Helm modules doesn't have `include` set and depends
on content that's not captured with the default include, you will need
to update the relevant `garden.yml` file and set the includes manually.

Helm 2.x is no longer supported. The migration (both for garden-system
services and your project namespace) is handled automatically
via the `helm 2to3` plugin. It is _possible_ that the automatic
migration fails though (due to any number of potential issues with
Helm or issues exposed with individual charts upon upgrade).

We've tried to cover and test for these  cases as best we can, but can't
rule out issues, so you may need to intervene (by e.g. manually removing
resources or using the helm CLI directly) if migration or upgrades after
deployment throw errors.

If you do run into tricky issues, please don't hesitate to log issues
on GitHub or ping us on Slack and we'll be happy to help.

Any user scripts that run `garden init` will need to be updated to
remove those references.


<a name="v0.10.16"></a>
## [v0.10.16](https://github.com/garden-io/garden/compare/v0.10.15...v0.10.16) (2019-12-06)

### Bug Fixes

* broken link to 'Using Garden' page ([87142c63](https://github.com/garden-io/garden/commit/87142c63))
* **build:** build status log line kept spinning when --force=false ([7ea5f31a](https://github.com/garden-io/garden/commit/7ea5f31a))
* **build:** fix intermittent concurrency issues when staging build ([f7057580](https://github.com/garden-io/garden/commit/f7057580))
* **cli:** fix janky spinner when initializing providers ([eb0eb33d](https://github.com/garden-io/garden/commit/eb0eb33d))
* **config:** throw error on base module schema validation errors ([1e129b65](https://github.com/garden-io/garden/commit/1e129b65))
* **core:** plugins with base now inherit the config schema ([ea3a0060](https://github.com/garden-io/garden/commit/ea3a0060))
* **core:** error when services had runtime dependencies on task outputs ([d26595f6](https://github.com/garden-io/garden/commit/d26595f6))
* **dashboard:** fix hooks render order on logs page ([fb80d34b](https://github.com/garden-io/garden/commit/fb80d34b))
* **k8s:** env vars weren't passed to services with `garden run service` ([8d66f8a8](https://github.com/garden-io/garden/commit/8d66f8a8))
* **k8s:** don't truncate container build logs ([d31aa8ec](https://github.com/garden-io/garden/commit/d31aa8ec))
* **k8s:** kaniko would hang when building remote images ([78d2df51](https://github.com/garden-io/garden/commit/78d2df51))
* **openfaas:** add retry when deploying in case faas-netes is starting ([ec37fd2c](https://github.com/garden-io/garden/commit/ec37fd2c))

### Code Refactoring

* **k8s:** allow overriding the default garden-system namespace ([de8c8253](https://github.com/garden-io/garden/commit/de8c8253))

### Features

* added securityContext for production flag ([a88edfac](https://github.com/garden-io/garden/commit/a88edfac))
* **k8s:** allow pulling base images when building in cluster ([e8679032](https://github.com/garden-io/garden/commit/e8679032))

### Improvements

* add protection to more commands ([df76dc30](https://github.com/garden-io/garden/commit/df76dc30))
* **config:** allow provider configs to reference variables ([56175ee1](https://github.com/garden-io/garden/commit/56175ee1))


<a name="v0.10.15"></a>
## [v0.10.15](https://github.com/garden-io/garden/compare/v0.10.14...v0.10.15) (2019-11-15)

### Bug Fixes

* displaced/wrong logging when setting up cert-manager ([eef701d3](https://github.com/garden-io/garden/commit/eef701d3))
* **core:** ensure deletes are synced when staging builds ([6cb6a3af](https://github.com/garden-io/garden/commit/6cb6a3af))
* **examples:** set correct context for demo-project ([d5f82b53](https://github.com/garden-io/garden/commit/d5f82b53))
* **k8s:** helm status check now compares Garden version ([28c59879](https://github.com/garden-io/garden/commit/28c59879))
* **k8s:** remove the tick ([7fa781c2](https://github.com/garden-io/garden/commit/7fa781c2))
* **k8s:** don't match on version label when getting workload pods ([f9b6b069](https://github.com/garden-io/garden/commit/f9b6b069))
* **logger:** parameters weren't being solved correctly ([aa7d3fa5](https://github.com/garden-io/garden/commit/aa7d3fa5))
* **sync:** issue with build staging sync procedure on Windows ([785d54f6](https://github.com/garden-io/garden/commit/785d54f6))
* **sync:** fix intermittent concurrency issues while syncing directories ([385b1dd1](https://github.com/garden-io/garden/commit/385b1dd1))
* **watcher:** use exclude options to optimize file watching ([#1320](https://github.com/garden-io/garden/issues/1320)) ([aa82e899](https://github.com/garden-io/garden/commit/aa82e899))
* **windows:** fix excludes and filename anchoring ([b3539c37](https://github.com/garden-io/garden/commit/b3539c37))
* **windows:** normalize path for sync temp directory ([27617765](https://github.com/garden-io/garden/commit/27617765))

### Features

* implement production flag ([e0bb7be4](https://github.com/garden-io/garden/commit/e0bb7be4))
* allow exporting artifacts from task and test runs ([a1e4c1c1](https://github.com/garden-io/garden/commit/a1e4c1c1))
* **commands:** add test/task artifacts to command result ([63f245b2](https://github.com/garden-io/garden/commit/63f245b2))
* **dashboard:** show artifacts in test/task result sidebar ([770ff304](https://github.com/garden-io/garden/commit/770ff304))
* **k8s:** add `clusterDocker.enableBuildKit` option ([c1886f55](https://github.com/garden-io/garden/commit/c1886f55))
* **k8s:** cert-manager integration ([#1261](https://github.com/garden-io/garden/issues/1261)) ([21f2775b](https://github.com/garden-io/garden/commit/21f2775b))

### Improvements

* **core:** delete services in dep order ([7895c926](https://github.com/garden-io/garden/commit/7895c926))
* **k8s:** tune probes for build-sync pods ([68ba9104](https://github.com/garden-io/garden/commit/68ba9104))
* **k8s:** update in-cluster docker to 19.03.4 ([a4fb4182](https://github.com/garden-io/garden/commit/a4fb4182))
* **k8s:** skip superfluous service endpoint check ([93ee43c2](https://github.com/garden-io/garden/commit/93ee43c2))
* **k8s:** much faster init and status checks ([cca55970](https://github.com/garden-io/garden/commit/cca55970))
* **openfaas:** updated faas-netes and made more configurable ([4b188ee7](https://github.com/garden-io/garden/commit/4b188ee7))


<a name="v0.10.14"></a>
## [v0.10.14](https://github.com/garden-io/garden/compare/v0.10.13...v0.10.14) (2019-11-01)

### Bug Fixes

* **k8s:** hostPath is now relative to module source path ([8b9bbfee](https://github.com/garden-io/garden/commit/8b9bbfee))
* **k8s:** handle CronJob resources correctly ([e7a46463](https://github.com/garden-io/garden/commit/e7a46463))
* **terraform:** error when no variables are specified in provider config ([6251d90f](https://github.com/garden-io/garden/commit/6251d90f))

### Code Refactoring

* standardise error message from execa and spawn ([035599da](https://github.com/garden-io/garden/commit/035599da))
* **core:** rename ActionHelper to ActionRouter ([ac48a669](https://github.com/garden-io/garden/commit/ac48a669))
* **plugin:** implement module type inheritance and polymorphism ([59fef9f1](https://github.com/garden-io/garden/commit/59fef9f1))
* **plugins:** formalize plugin and module type extension mechanisms ([8ae84348](https://github.com/garden-io/garden/commit/8ae84348))
* **plugins:** make plugin definition interface more intuitive ([de9b3c95](https://github.com/garden-io/garden/commit/de9b3c95))

### Features

* **k8s:** allow specifying tolerations for registry-proxy ([#1296](https://github.com/garden-io/garden/issues/1296)) ([1fc83103](https://github.com/garden-io/garden/commit/1fc83103))
* **plugins:** add local flag to exec module type ([3c1fa5a6](https://github.com/garden-io/garden/commit/3c1fa5a6))

### Improvements

* **k8s:** move back to upstream kubernetes client library ([7af3ceb5](https://github.com/garden-io/garden/commit/7af3ceb5))
* **k8s:** also delete metadata namespace when cleaning up ([f3af8777](https://github.com/garden-io/garden/commit/f3af8777))
* **maven-container:** add JDK 13 support + some tweaks and fixes ([8cddab8f](https://github.com/garden-io/garden/commit/8cddab8f))


<a name="v0.10.13"></a>
## [v0.10.13](https://github.com/garden-io/garden/compare/v0.10.12...v0.10.13) (2019-10-11)

### Bug Fixes

* **k8s:** don't install NFS provisioner when sync storage class is set ([f0263371](https://github.com/garden-io/garden/commit/f0263371))
* **k8s:** avoid issues with NFS provisioner on node/pod eviction ([2f2eef80](https://github.com/garden-io/garden/commit/2f2eef80))
* **k8s:** add missing command argument to helm module test schema ([c5fc53af](https://github.com/garden-io/garden/commit/c5fc53af))
* **vcs:** no files were found when dotIgnoreFiles was set to empty list ([48208005](https://github.com/garden-io/garden/commit/48208005))


<a name="v0.10.12"></a>
## [v0.10.12](https://github.com/garden-io/garden/compare/v0.10.11...v0.10.12) (2019-10-02)

### Bug Fixes

* **commands:** fix regression due to changes to test|task result output ([71e204d3](https://github.com/garden-io/garden/commit/71e204d3))
* **core:** null reference error when an action with dependants failed ([7c1fb0d2](https://github.com/garden-io/garden/commit/7c1fb0d2))
* **k8s:** ensure get logs handler resolves ([4763532c](https://github.com/garden-io/garden/commit/4763532c))
* **k8s:** filter out failed and evicted pods when listing ([65e4d0ff](https://github.com/garden-io/garden/commit/65e4d0ff))

### Code Refactoring

* **core:** only set config names once in resolveModuleConfigs ([baabb98e](https://github.com/garden-io/garden/commit/baabb98e))
* **dashboard:** pass deps to useEffect hook ([2f291ecc](https://github.com/garden-io/garden/commit/2f291ecc))

### Improvements

* **config:** add linkUrl field ([b77fe934](https://github.com/garden-io/garden/commit/b77fe934))
* **logger:** skip fancy rendering when log level > info ([ff22a48d](https://github.com/garden-io/garden/commit/ff22a48d))


<a name="v0.10.11"></a>
## [v0.10.11](https://github.com/garden-io/garden/compare/v0.10.10...v0.10.11) (2019-09-24)

### Bug Fixes

* **dashboard:** ensure fresh store state when merging data ([bf5b5d0d](https://github.com/garden-io/garden/commit/bf5b5d0d))

### Features

* **container:** added hotReload.postSyncCommand ([eb942883](https://github.com/garden-io/garden/commit/eb942883))


<a name="v0.10.10"></a>
## [v0.10.10](https://github.com/garden-io/garden/compare/v0.10.9...v0.10.10) (2019-09-20)

### Bug Fixes

* temporarily removed action ([f30bea7b](https://github.com/garden-io/garden/commit/f30bea7b))
* **k8s:** exec-ing and hot-reloading only worked for Deployments ([6d00df44](https://github.com/garden-io/garden/commit/6d00df44))
* **k8s:** don't include any hooks when checking resource statuses ([ca6462c5](https://github.com/garden-io/garden/commit/ca6462c5))
* **k8s:** helm returned deprecated manifest version for tiller ([9da49d41](https://github.com/garden-io/garden/commit/9da49d41))
* **kubernetes-module:** handle namespace attribute correctly ([b6fffd06](https://github.com/garden-io/garden/commit/b6fffd06))
* **vcs:** recursively handle submodules when scanning for files ([06eabdaa](https://github.com/garden-io/garden/commit/06eabdaa))

### Code Refactoring

* change `varFile` parameter name to `varfile` ([71e37fbf](https://github.com/garden-io/garden/commit/71e37fbf))
* **dashboard:** normalize data store + merge events ([0d96fdb5](https://github.com/garden-io/garden/commit/0d96fdb5))
* **plugin:** make ServiceStatus detail type-safe ([37ecd0a6](https://github.com/garden-io/garden/commit/37ecd0a6))

### Features

* experimental blue-green deployment ([01f59f5b](https://github.com/garden-io/garden/commit/01f59f5b))
* **k8s:** add timeout parameter to helm module type ([373beeb9](https://github.com/garden-io/garden/commit/373beeb9))

### Improvements

* better error output when ext commands fail (e.g. kubectl) ([43220575](https://github.com/garden-io/garden/commit/43220575))
* better error when attempting to run outside of git repo ([11887d7b](https://github.com/garden-io/garden/commit/11887d7b))
* **k8s:** better error logging for kubectl port forwards ([5a5d5393](https://github.com/garden-io/garden/commit/5a5d5393))
* **k8s:** update kubectl to v1.16.0 ([3fb518d5](https://github.com/garden-io/garden/commit/3fb518d5))
* **task-graph:** add more fields to events ([2e5c9e30](https://github.com/garden-io/garden/commit/2e5c9e30))


<a name="v0.10.9"></a>
## [v0.10.9](https://github.com/garden-io/garden/compare/v0.10.8...v0.10.9) (2019-09-11)

### Bug Fixes

* **k8s:** ensure sys metadata ns exists for tests ([c88af24f](https://github.com/garden-io/garden/commit/c88af24f))
* **task-graph:** fix error log output ([6329cd66](https://github.com/garden-io/garden/commit/6329cd66))
* **tasks:** respect force flag in task task ([3b9ba8ee](https://github.com/garden-io/garden/commit/3b9ba8ee))
* **vcs:** overflow error when repo contains large number of files ([#1165](https://github.com/garden-io/garden/issues/1165)) ([4f5fabcc](https://github.com/garden-io/garden/commit/4f5fabcc))

### Code Refactoring

* make joi.meta() arguments type-safe ([a8789903](https://github.com/garden-io/garden/commit/a8789903))

### Features

* **config:** add a number of new operators for template expressions ([0a764695](https://github.com/garden-io/garden/commit/0a764695))
* **config:** add support for varFiles ([e2ade318](https://github.com/garden-io/garden/commit/e2ade318))

### Improvements

* added more headers to checkForUpdates ([8f1c4437](https://github.com/garden-io/garden/commit/8f1c4437))
* tweak debugging log levels ([7ecbacc0](https://github.com/garden-io/garden/commit/7ecbacc0))


<a name="v0.10.8"></a>
## [v0.10.8](https://github.com/garden-io/garden/compare/v0.10.7...v0.10.8) (2019-09-05)

### Bug Fixes

* add success/error logging for get task result ([d9efa0fa](https://github.com/garden-io/garden/commit/d9efa0fa))
* error in test result output schema ([85137217](https://github.com/garden-io/garden/commit/85137217))

### Improvements

* check that the static dir exists ([5ba7b341](https://github.com/garden-io/garden/commit/5ba7b341))


<a name="v0.10.7"></a>
## [v0.10.7](https://github.com/garden-io/garden/compare/v0.10.6...v0.10.7) (2019-09-04)

### Bug Fixes

* task/test results outputs are not shown ([4a8516e6](https://github.com/garden-io/garden/commit/4a8516e6))
* allow dots in env variable names ([a8f7dd12](https://github.com/garden-io/garden/commit/a8f7dd12))
* running task would print undefined ([729e8cdf](https://github.com/garden-io/garden/commit/729e8cdf))
* **config:** relax constraints on variable and output names ([442f8f80](https://github.com/garden-io/garden/commit/442f8f80))
* **container:** allow any string as ingress path ([79202280](https://github.com/garden-io/garden/commit/79202280))
* **exec:** wrong cwd when running `exec` module tests ([12987aeb](https://github.com/garden-io/garden/commit/12987aeb))
* **k8s:** allow user to configure own storageClass for build-sync volume ([fc0037f9](https://github.com/garden-io/garden/commit/fc0037f9))
* **k8s:** error when retrieving older test results from cache ([e3db60af](https://github.com/garden-io/garden/commit/e3db60af))
* **logger:** display duration in seconds ([53ea69af](https://github.com/garden-io/garden/commit/53ea69af))
* **logger:** concat messages when formatting for json ([92dcb93f](https://github.com/garden-io/garden/commit/92dcb93f))
* **openfaas:** user env variables weren't passed to the function ([dd1ed8a8](https://github.com/garden-io/garden/commit/dd1ed8a8))
* **openfaas:** build function before getting container build status ([4693f13b](https://github.com/garden-io/garden/commit/4693f13b))
* **vcs:** .gitignore files were not respected ([5c08d614](https://github.com/garden-io/garden/commit/5c08d614))
* **watcher:** raise log level for watch events ([14eb4ea5](https://github.com/garden-io/garden/commit/14eb4ea5))

### Features

* add terraform provider and example with basic GKE setup ([32651d84](https://github.com/garden-io/garden/commit/32651d84))
* **container:** output build log while building with debug log level ([4487380b](https://github.com/garden-io/garden/commit/4487380b))
* **core:** expose service and task dependency outputs at runtime ([#1123](https://github.com/garden-io/garden/issues/1123)) ([fca6a72a](https://github.com/garden-io/garden/commit/fca6a72a))
* **k8s:** allow setting custom kubeconfig path ([8b4a6d5e](https://github.com/garden-io/garden/commit/8b4a6d5e))

### Improvements

* **logger:** store all message states ([b68f3435](https://github.com/garden-io/garden/commit/b68f3435))


<a name="v0.10.6"></a>
## [v0.10.6](https://github.com/garden-io/garden/compare/v0.10.5...v0.10.6) (2019-08-20)

### Bug Fixes

* **minikube:** use dashboard addon instead of static helm chart ([f7488d89](https://github.com/garden-io/garden/commit/f7488d89))
* **minikube:** fix incorrect error handling ([1f8e96b2](https://github.com/garden-io/garden/commit/1f8e96b2))
* **proxy:** handle undefined _remote Socket ([0caae294](https://github.com/garden-io/garden/commit/0caae294))
* **vcs:** include submodules with remote sources ([d1ae6882](https://github.com/garden-io/garden/commit/d1ae6882))
* **watcher:** native fsevents were not used in dist build on macOS ([4eb00a6d](https://github.com/garden-io/garden/commit/4eb00a6d))

### Features

* **container:** add build.timeout option ([fd580379](https://github.com/garden-io/garden/commit/fd580379))
* **helm:** add valueFiles field to specify custom value files ([#1099](https://github.com/garden-io/garden/issues/1099)) ([ca47483c](https://github.com/garden-io/garden/commit/ca47483c))


<a name="v0.10.5"></a>
## [v0.10.5](https://github.com/garden-io/garden/compare/v0.10.4...v0.10.5) (2019-08-13)

### Bug Fixes

* exception when retrieving logs from helm resource ([5aa4e959](https://github.com/garden-io/garden/commit/5aa4e959))
* pr bugs (TBS) ([461e5f64](https://github.com/garden-io/garden/commit/461e5f64))
* plugin command issues (TBS) ([da326b93](https://github.com/garden-io/garden/commit/da326b93))
* **remote-sources:** ensure Garden also watches linked repos ([060075f5](https://github.com/garden-io/garden/commit/060075f5))
* **server:** re-use Garden instance when running commands for API calls ([5d873a0c](https://github.com/garden-io/garden/commit/5d873a0c))

### Features

* **core:** providers can now reference each others' outputs ([2ca2774c](https://github.com/garden-io/garden/commit/2ca2774c))

### Improvements

* **watcher:** adding/removing many files/dirs more performant ([#1087](https://github.com/garden-io/garden/issues/1087)) ([b1d0f9a9](https://github.com/garden-io/garden/commit/b1d0f9a9))


<a name="v0.10.4"></a>
## [v0.10.4](https://github.com/garden-io/garden/compare/v0.10.3...v0.10.4) (2019-08-06)

### Bug Fixes

* handle case when the docker repo doesn't contain tags ([b0e80951](https://github.com/garden-io/garden/commit/b0e80951))
* **container:** allow setting nodePort=true on container modules ([8d75188c](https://github.com/garden-io/garden/commit/8d75188c))
* **core:** error in some cases when referencing modules within file ([377fd2e4](https://github.com/garden-io/garden/commit/377fd2e4))
* **k8s:** create a single NodePort Service when a node port is set ([f8d1b4b3](https://github.com/garden-io/garden/commit/f8d1b4b3))
* **run:** interactive run module/service commands not working ([8ccc06d1](https://github.com/garden-io/garden/commit/8ccc06d1))

### Features

* automatic port forwarding for deployed services ([43b414f5](https://github.com/garden-io/garden/commit/43b414f5))
* **container:** add extraFlags option for docker builder ([2a740686](https://github.com/garden-io/garden/commit/2a740686))

### Improvements

* update the get debug-info command ([117efe30](https://github.com/garden-io/garden/commit/117efe30))


<a name="v0.10.3"></a>
## [v0.10.3](https://github.com/garden-io/garden/compare/v0.10.2...v0.10.3) (2019-08-01)

### Bug Fixes

* update ansi-escapes to fix spinner issue on macOS Terminal.app ([be9f6883](https://github.com/garden-io/garden/commit/be9f6883))
* handle blank build args appropriately ([33c12ebb](https://github.com/garden-io/garden/commit/33c12ebb))
* fix 'cannot read property error of null' error ([c7bc3d90](https://github.com/garden-io/garden/commit/c7bc3d90))
* exclude symlinks to directories from hashing ([#1044](https://github.com/garden-io/garden/issues/1044)) ([514f9f57](https://github.com/garden-io/garden/commit/514f9f57))
* review update (TBS) ([df608246](https://github.com/garden-io/garden/commit/df608246))
* **config:** whitespace was incorrrectly stripped around format strings ([ee325573](https://github.com/garden-io/garden/commit/ee325573))
* **core:** log level was 'info' when it should have been 'silly' ([fa9aff97](https://github.com/garden-io/garden/commit/fa9aff97))
* **hot-reload:** fix path handling for Windows and add tests ([50c57208](https://github.com/garden-io/garden/commit/50c57208))
* **k8s:** ignore older ReplicaSet Pods when checking Deployment status ([a8cfe635](https://github.com/garden-io/garden/commit/a8cfe635))
* **k8s:** hot reloading stopped working after config reload ([a914d4b5](https://github.com/garden-io/garden/commit/a914d4b5))
* **k8s:** avoid "no deployed releases" errors after Helm install failure ([#1046](https://github.com/garden-io/garden/issues/1046)) ([87dc9225](https://github.com/garden-io/garden/commit/87dc9225))

### Features

* **core:** make module scans more configurable and ignores more robust ([#1019](https://github.com/garden-io/garden/issues/1019)) ([4afeebf4](https://github.com/garden-io/garden/commit/4afeebf4))
* **core:** add exclude field for modules ([92210c50](https://github.com/garden-io/garden/commit/92210c50))
* **openfaas:** enable remote building for openfaas modules ([a0d913d8](https://github.com/garden-io/garden/commit/a0d913d8))

### Improvements

* install kubectl in garden-gcloud image ([#1035](https://github.com/garden-io/garden/issues/1035)) ([2a49adc3](https://github.com/garden-io/garden/commit/2a49adc3))
* removed get debug-info request due ([6bd8af1c](https://github.com/garden-io/garden/commit/6bd8af1c))


<a name="v0.10.2"></a>
## [v0.10.2](https://github.com/garden-io/garden/compare/v0.10.1...v0.10.2) (2019-07-23)

### Bug Fixes

* **config:** ignore empty docs in garden.yml files ([d66cf5de](https://github.com/garden-io/garden/commit/d66cf5de))
* **container:** respect include field when checking for Dockerfile ([0df7a8dd](https://github.com/garden-io/garden/commit/0df7a8dd))
* **core:** task dependencies were not automatically run ahead of tests ([46fb474f](https://github.com/garden-io/garden/commit/46fb474f))
* **core:** ensure untracked files from .gardenignore are excluded ([a10bb289](https://github.com/garden-io/garden/commit/a10bb289))
* **core:** properly handle joining K8s api server url and path ([8a56d199](https://github.com/garden-io/garden/commit/8a56d199))
* **k8s:** update deprecated Deployment API versions ahead of 1.16 ([7cab3711](https://github.com/garden-io/garden/commit/7cab3711))
* **k8s:** remote building broken with certain cluster network configs ([bf9a25ee](https://github.com/garden-io/garden/commit/bf9a25ee))
* **log:** error when logging object with circular refs ([61bf65ff](https://github.com/garden-io/garden/commit/61bf65ff))
* **vcs:** fixed support for GitHub SSH URLs and added tests ([6e40f18c](https://github.com/garden-io/garden/commit/6e40f18c))
* **vcs:** garden.yml changes now only affect relevant module version ([#1009](https://github.com/garden-io/garden/issues/1009)) ([2ff4edfb](https://github.com/garden-io/garden/commit/2ff4edfb))
* **vcs:** allow ssh for git repo URLs ([fef8ea5b](https://github.com/garden-io/garden/commit/fef8ea5b))

### Features

* **k8s:** add uninstall-garden-services command ([93521763](https://github.com/garden-io/garden/commit/93521763))

### Improvements

* **core:** crucial enhancements to command ([4dbdc154](https://github.com/garden-io/garden/commit/4dbdc154))
* **core:** make contributor more visible in CLI ([0f9a7ffc](https://github.com/garden-io/garden/commit/0f9a7ffc))


<a name="v0.10.1"></a>
## [v0.10.1](https://github.com/garden-io/garden/compare/v0.10.0...v0.10.1) (2019-07-17)

### Bug Fixes

* various issues with path handling on Windows ([ea001d40](https://github.com/garden-io/garden/commit/ea001d40))
* declare latest version of fsevents explicity ([f733afc6](https://github.com/garden-io/garden/commit/f733afc6))
* test fixes and docs update ([7616fa38](https://github.com/garden-io/garden/commit/7616fa38))
* garden can again be run from project subdirs ([560604f1](https://github.com/garden-io/garden/commit/560604f1))
* hot-reloading and remote builds didn't work on Windows ([40133353](https://github.com/garden-io/garden/commit/40133353))
* removed single quote from CREATE TABLE statement ([a4b33c5e](https://github.com/garden-io/garden/commit/a4b33c5e))
* emit taskComplete when adding cached tasks ([e1d49f26](https://github.com/garden-io/garden/commit/e1d49f26))
* **cli:** fix log inconsistencies ([12c242a9](https://github.com/garden-io/garden/commit/12c242a9))
* **core:** rsync error when running from dist build ([70c3e595](https://github.com/garden-io/garden/commit/70c3e595))
* **core:** respect includes/excludes when syncing to build directory ([becfcd39](https://github.com/garden-io/garden/commit/becfcd39))
* **helm:** add missing command directive to task spec ([065b2840](https://github.com/garden-io/garden/commit/065b2840))
* **k8s:** error when copying TLS secrets between namespaces ([623a72d3](https://github.com/garden-io/garden/commit/623a72d3))
* **k8s:** skip setMinikubeDockerEnv when vm-driver=None ([0825c5a0](https://github.com/garden-io/garden/commit/0825c5a0))
* **k8s:** ensure images built remotely are tagged before publishing ([63a2bbab](https://github.com/garden-io/garden/commit/63a2bbab))
* **k8s:** respect in-cluster builder storage size configuration ([6a0c61c2](https://github.com/garden-io/garden/commit/6a0c61c2))
* **k8s:** make sure Service Endpoints are ready at end of status checks ([4678f400](https://github.com/garden-io/garden/commit/4678f400))
* **k8s:** build --force would error with cluster-docker and no Dockerfile ([710e8458](https://github.com/garden-io/garden/commit/710e8458))
* **k8s:** always flatten resources of kind List ([b6368f76](https://github.com/garden-io/garden/commit/b6368f76))
* **k8s:** support client cert authentication ([2a3848ab](https://github.com/garden-io/garden/commit/2a3848ab))
* **k8s:** cluster registry only worked when service CIDR was 10.x.x.x/y ([609b6b1b](https://github.com/garden-io/garden/commit/609b6b1b))
* **task-graph:** fix task deduplication ([6979f8b5](https://github.com/garden-io/garden/commit/6979f8b5))
* **task-graph:** use latest version for dedup ([83803970](https://github.com/garden-io/garden/commit/83803970))
* **task-gtaph:** emit taskCancelled events ([b6d8846f](https://github.com/garden-io/garden/commit/b6d8846f))

### Features

* added glob and test names to dev/test commands ([df31b772](https://github.com/garden-io/garden/commit/df31b772))
* implemented --skip-tests flag ([dde191f6](https://github.com/garden-io/garden/commit/dde191f6))
* add env var for setting max task concurrency ([c3383d23](https://github.com/garden-io/garden/commit/c3383d23))
* **container:** allow referencing Kubernetes secrets in container modules ([4c603c38](https://github.com/garden-io/garden/commit/4c603c38))

### Improvements

* updated PATH to include all gcloud bin-s ([413fd02a](https://github.com/garden-io/garden/commit/413fd02a))
* **dashboard:** add taskCancelled support to stack graph page ([76c154b6](https://github.com/garden-io/garden/commit/76c154b6))
* **k8s:** cluster cleanup command now also cleans build sync dir ([69f41982](https://github.com/garden-io/garden/commit/69f41982))
* **k8s:** fail fast on CreateContainerConfigError ([557be338](https://github.com/garden-io/garden/commit/557be338))


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

### Improvements

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

### Improvements

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

### Improvements

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

### Improvements

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

### Improvements

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

### Improvements

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

### Improvements

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

### Improvements

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

