<a name="0.3.0"></a>
# [0.3.0](https://github.com/garden-io/garden/compare/v0.2.0...v0.3.0) (2018-07-10)


### Bug Fixes

* ensure namespace is removed before returning when deleting env ([f381d33](https://github.com/garden-io/garden/commit/f381d33))
* fixed more issues with cross-repo versioning ([2b0d93e](https://github.com/garden-io/garden/commit/2b0d93e))
* set identifier max length to match k8s service name limit ([ad0a54f](https://github.com/garden-io/garden/commit/ad0a54f))
* **create-commands:** rename function type to google-cloud-function ([49c4c93](https://github.com/garden-io/garden/commit/49c4c93))
* **create-module-command:** type option should be an enum ([a8316d1](https://github.com/garden-io/garden/commit/a8316d1))
* **file-writer:** only create file if content to write ([562daa8](https://github.com/garden-io/garden/commit/562daa8))


### Code Refactoring

* **k8s:** change metadata namespace name ([6f73299](https://github.com/garden-io/garden/commit/6f73299))
* build command is now an array, for consistency ([0bf020a](https://github.com/garden-io/garden/commit/0bf020a))


### Features

* **cli:** enable custom hints in help message ([37c3159](https://github.com/garden-io/garden/commit/37c3159))
* add create project/module commands ([b611b35](https://github.com/garden-io/garden/commit/b611b35))
* allow numeric log levels ([e2a7b6f](https://github.com/garden-io/garden/commit/e2a7b6f))
* **config:** add `${local.platform}` template key ([1c6d492](https://github.com/garden-io/garden/commit/1c6d492))
* **container:** add `env` key to specify env vars for containers ([9fa0cb8](https://github.com/garden-io/garden/commit/9fa0cb8))
* **generic:** add env var support to generic module type ([a5096ee](https://github.com/garden-io/garden/commit/a5096ee))
* **k8s:** add repo parameter to helm module type ([5d3af14](https://github.com/garden-io/garden/commit/5d3af14))
* **k8s:** allow specifying default username in k8s provider config ([1e42cfb](https://github.com/garden-io/garden/commit/1e42cfb))


### Performance Improvements

* generic plugin now keeps track of last built version ([ab3714b](https://github.com/garden-io/garden/commit/ab3714b))


### BREAKING CHANGES

* Any existing garden.yml files with the `build.command` key set need
to be updated to provide an array of strings as a command, as opposed to
a simple string.
* **k8s:** Existing metadata namespaces will have to be manually cleaned up.
We suggest resetting local k8s clusters after upgrading.
* **container:** The `tests[].variables` config key has been removed from the
`garden.yml` configuration file schema.



<a name="0.2.0"></a>
# [0.2.0](https://github.com/garden-io/garden/compare/v0.1.2...v0.2.0) (2018-06-27)


### Bug Fixes

* add missing lodash dependency (!) ([2abb90c](https://github.com/garden-io/garden/commit/2abb90c))
* broken `npm run dev` after package.json changes ([8bd6217](https://github.com/garden-io/garden/commit/8bd6217))
* **core:** potential race-condition when parsing modules ([944e150](https://github.com/garden-io/garden/commit/944e150))
* don't run dist script on every npm install ([c73f5e1](https://github.com/garden-io/garden/commit/c73f5e1))
* error in `Module.getVersion()` ([6491678](https://github.com/garden-io/garden/commit/6491678))
* malformed output from `ctx.getStatus()` ([#134](https://github.com/garden-io/garden/issues/134)) ([d222721](https://github.com/garden-io/garden/commit/d222721))
* **k8s:** incorrect use of execa ([cecbaa3](https://github.com/garden-io/garden/commit/cecbaa3))
* module versions are now handled properly across multiple repos ([c647cf9](https://github.com/garden-io/garden/commit/c647cf9))
* **ci:** only do clean install from package-lock ([3c44191](https://github.com/garden-io/garden/commit/3c44191))
* **cli:** add missing shebang line in garden binary ([632925d](https://github.com/garden-io/garden/commit/632925d))
* **cli:** delete environment command wasn't linked to parent ([e0789f1](https://github.com/garden-io/garden/commit/e0789f1))
* **cli:** enforce single character option aliases ([a49e799](https://github.com/garden-io/garden/commit/a49e799))
* **cli:** set error code when calling CLI with bad command ([bb24acd](https://github.com/garden-io/garden/commit/bb24acd))
* **container:** build issue where Dockerfile is copied or generated ([c0186d9](https://github.com/garden-io/garden/commit/c0186d9))
* **ctx:** better error.log output from `processModules()` ([b0eb86e](https://github.com/garden-io/garden/commit/b0eb86e))
* **integ:** fix init env command in integ test script ([f644ec2](https://github.com/garden-io/garden/commit/f644ec2))
* **k8s:** better error message when kubectl fails ([41f1482](https://github.com/garden-io/garden/commit/41f1482))
* **k8s:** patch bugs in kubernetes client ([e45f72a](https://github.com/garden-io/garden/commit/e45f72a))
* **logger:** remove unnecessary call to stopLoop ([db84561](https://github.com/garden-io/garden/commit/db84561))
* pin npm version in CircleCI ([206d946](https://github.com/garden-io/garden/commit/206d946))
* test result versions now correctly account for test dependencies ([8b8a6bd](https://github.com/garden-io/garden/commit/8b8a6bd))
* **vsc:** handle weird stat behavior by wrapping it ([df11647](https://github.com/garden-io/garden/commit/df11647))


### Code Refactoring

* consistently use verb before noun in CLI ([e88e55e](https://github.com/garden-io/garden/commit/e88e55e))
* rename project.global to project.environmentDefaults ([#131](https://github.com/garden-io/garden/issues/131)) ([3ebe1dc](https://github.com/garden-io/garden/commit/3ebe1dc))


### Features

* **build:** Handle config changes in auto-reload. ([9d9295f](https://github.com/garden-io/garden/commit/9d9295f))
* **k8s:** add helm module type ([122e6dd](https://github.com/garden-io/garden/commit/122e6dd))
* generate homebrew formula on publish ([72c4b4d](https://github.com/garden-io/garden/commit/72c4b4d))


### Performance Improvements

* got rid of all synchronous subprocess and filesystem calls ([9b62424](https://github.com/garden-io/garden/commit/9b62424))
* implemented caching of module version ([e451f7a](https://github.com/garden-io/garden/commit/e451f7a))


### BREAKING CHANGES

* The following CLI commands have now been renamed, and any scripts
using them need to be updated accordingly:
`config delete` -> `delete config`
`config get` -> `get config`
`config set` -> `set config`
`environment configure` -> `init environment`
`environment destroy` -> `delete environment`
`status` -> `get status`
* Existing garden.yml files will need to be updated if they use the
project.global key.



<a name="0.1.2"></a>
## [0.1.2](https://github.com/garden-io/garden/compare/v0.1.0...v0.1.2) (2018-06-02)


### Bug Fixes

* **utils:** gulp dev dependencies and update util/index ([9e65f02](https://github.com/garden-io/garden/commit/9e65f02))
* add missing prepublish step ([a1dbde9](https://github.com/garden-io/garden/commit/a1dbde9))
* incorrect bin link in package.json ([237ce85](https://github.com/garden-io/garden/commit/237ce85))



<a name="0.1.0"></a>
# [0.1.0](https://github.com/garden-io/garden/compare/0766b56...v0.1.0) (2018-05-31)


### Bug Fixes

* [#107](https://github.com/garden-io/garden/issues/107) & [#108](https://github.com/garden-io/garden/issues/108) - incl. deps in auto-reload. ([d1aaf5e](https://github.com/garden-io/garden/commit/d1aaf5e))
* [#85](https://github.com/garden-io/garden/issues/85) closing gulp watch didn't close tsc process ([4b3a7c4](https://github.com/garden-io/garden/commit/4b3a7c4))
* add better error logging for kubectl and rsync ([212304a](https://github.com/garden-io/garden/commit/212304a))
* add missing copyright-header dependency on CircleCI ([ceca5c4](https://github.com/garden-io/garden/commit/ceca5c4))
* add missing dependencies for copyright-header on OSX ([d4d639f](https://github.com/garden-io/garden/commit/d4d639f))
* add missing license header ([f6e11d9](https://github.com/garden-io/garden/commit/f6e11d9))
* added missing "Done!" message at end of build command ([a05f2c5](https://github.com/garden-io/garden/commit/a05f2c5))
* Added OperationQueue to TaskGraph. ([ae79785](https://github.com/garden-io/garden/commit/ae79785))
* allow commands to specify logger type ([893f9e2](https://github.com/garden-io/garden/commit/893f9e2))
* allow empty output from test runs ([67a2d95](https://github.com/garden-io/garden/commit/67a2d95))
* allow unkown keys in baseModuleSchema ([78303de](https://github.com/garden-io/garden/commit/78303de))
* bad timestamp values could crash log command ([4383d75](https://github.com/garden-io/garden/commit/4383d75))
* better and more consistent error handling in CLI commands ([36ba7b7](https://github.com/garden-io/garden/commit/36ba7b7))
* better error output when gulp add-version-files fails ([0fc4ee4](https://github.com/garden-io/garden/commit/0fc4ee4))
* better handling of streams not from logger ([42fa17e](https://github.com/garden-io/garden/commit/42fa17e))
* better kubectl errors ([76fabd6](https://github.com/garden-io/garden/commit/76fabd6))
* better logger types ([56596fb](https://github.com/garden-io/garden/commit/56596fb))
* better output rendering for JSON responses in call command ([1aecfe0](https://github.com/garden-io/garden/commit/1aecfe0))
* bug in CLI when handling errors ([f7ae4dd](https://github.com/garden-io/garden/commit/f7ae4dd))
* build staging no longer copies symlinks ([0fc60bd](https://github.com/garden-io/garden/commit/0fc60bd))
* Cache results to skip superfluous tasks. ([0632e36](https://github.com/garden-io/garden/commit/0632e36))
* Cancel dependants on task error. ([6831608](https://github.com/garden-io/garden/commit/6831608))
* changed how paths are handled when copying build dependencies ([d6506da](https://github.com/garden-io/garden/commit/d6506da))
* Correction to FS watcher subscription logic. ([5969914](https://github.com/garden-io/garden/commit/5969914))
* deploy command would deploy all services from each processed module ([673630c](https://github.com/garden-io/garden/commit/673630c))
* disable ts-node cache in tests to avoid inconsistencies ([21f2d44](https://github.com/garden-io/garden/commit/21f2d44))
* ensure module build paths have trailing slash (for rsync) ([1c555d1](https://github.com/garden-io/garden/commit/1c555d1))
* error handling in hello-container ([f778fe9](https://github.com/garden-io/garden/commit/f778fe9))
* fix default log level on header and finish methods ([1eb143d](https://github.com/garden-io/garden/commit/1eb143d))
* fix destroy env command after kubernetes-client upgrade ([200fd01](https://github.com/garden-io/garden/commit/200fd01))
* issue where build dependencies couldn't be copied ([d3a44cd](https://github.com/garden-io/garden/commit/d3a44cd))
* issue where module scanning would hang with empty projects ([ec47c72](https://github.com/garden-io/garden/commit/ec47c72))
* issue with gulp watch and static files ([dc9cd9f](https://github.com/garden-io/garden/commit/dc9cd9f))
* issues with kubernetes-client after upgrade ([f4096a2](https://github.com/garden-io/garden/commit/f4096a2))
* k8s plugin now respects configured context ([a395b79](https://github.com/garden-io/garden/commit/a395b79))
* linting errors ([e839e8e](https://github.com/garden-io/garden/commit/e839e8e))
* linting errors in tests ([185eb69](https://github.com/garden-io/garden/commit/185eb69))
* minor logging fixes ([bde56fa](https://github.com/garden-io/garden/commit/bde56fa))
* package.json & .snyk to reduce vulnerabilities ([0766b56](https://github.com/garden-io/garden/commit/0766b56))
* partial CircleCI status on PRs ([7d0a3ef](https://github.com/garden-io/garden/commit/7d0a3ef))
* print json/yaml output after cli returns parse results ([eeadf16](https://github.com/garden-io/garden/commit/eeadf16))
* propagate force flag to deployService action ([6ccc9d0](https://github.com/garden-io/garden/commit/6ccc9d0))
* re-implemented local GCF plugin to fix issues ([3f2ee33](https://github.com/garden-io/garden/commit/3f2ee33))
* regression after splitting up GardenContext ([bbb6db5](https://github.com/garden-io/garden/commit/bbb6db5))
* remove .vscode directories in multi-container example ([ccd426d](https://github.com/garden-io/garden/commit/ccd426d))
* service outputs were not propagated to runtime context ([0151593](https://github.com/garden-io/garden/commit/0151593))
* syntax error in .release-it.json ([010a138](https://github.com/garden-io/garden/commit/010a138))
* temporarily disabling minikube tests in CI (issues with CircleCI) ([5e1b4bc](https://github.com/garden-io/garden/commit/5e1b4bc))
* test name was not included in test result keys ([3dac186](https://github.com/garden-io/garden/commit/3dac186))
* testModule handlers now receive runtime context ([6ea60b0](https://github.com/garden-io/garden/commit/6ea60b0))
* use built-in ingress controller and dashboard for minikube ([879bce2](https://github.com/garden-io/garden/commit/879bce2))
* version is now correctly set for plugin modules ([#84](https://github.com/garden-io/garden/issues/84)) ([d9c3757](https://github.com/garden-io/garden/commit/d9c3757))
* wrong function name in local-gcf-container ([7a7d5af](https://github.com/garden-io/garden/commit/7a7d5af))
* **cli:** duplicate command checks now accounts for subcommands ([b9e22f5](https://github.com/garden-io/garden/commit/b9e22f5))
* **cli:** map all Errors to GardenErrors and log accordingly ([02b05b3](https://github.com/garden-io/garden/commit/02b05b3))
* **hello-world:** npm package is now included in function build ([2795653](https://github.com/garden-io/garden/commit/2795653))
* **hello-world-example:** add missing Dockerfile directives ([4acc4cc](https://github.com/garden-io/garden/commit/4acc4cc))
* **logger:** fix basic-terminal-writer superflous newline ([bfc0fcf](https://github.com/garden-io/garden/commit/bfc0fcf))
* **logger:** more performant update function ([4d8c89e](https://github.com/garden-io/garden/commit/4d8c89e))


### Code Refactoring

* major overhaul to plugin architecture ([3b97e08](https://github.com/garden-io/garden/commit/3b97e08))


### Features

* add --watch flag to deploy command ([7b11d58](https://github.com/garden-io/garden/commit/7b11d58))
* add filter and find methods to logger ([814733b](https://github.com/garden-io/garden/commit/814733b))
* add force flag to env config command ([d5ba05b](https://github.com/garden-io/garden/commit/d5ba05b))
* add global --output flag for CLI ([7f25653](https://github.com/garden-io/garden/commit/7f25653))
* add login and logout commands ([00548e2](https://github.com/garden-io/garden/commit/00548e2))
* add loglevel as cli option and remove silent/verbose options ([985c160](https://github.com/garden-io/garden/commit/985c160))
* add run commands for ad-hoc runs of modules, services and tests ([3aca6ac](https://github.com/garden-io/garden/commit/3aca6ac))
* add scan command to output info about modules in project ([075e6c2](https://github.com/garden-io/garden/commit/075e6c2))
* add support for .gardenignore file ([7ba24b7](https://github.com/garden-io/garden/commit/7ba24b7))
* add truncatePrevious option to file-writer ([a64fbb0](https://github.com/garden-io/garden/commit/a64fbb0))
* add watch flag to test and build commands ([dd0a4fe](https://github.com/garden-io/garden/commit/dd0a4fe))
* added buildContext param to buildModule handlers ([141abe9](https://github.com/garden-io/garden/commit/141abe9))
* auto-rebuilding modules & FS watching ([8191aa8](https://github.com/garden-io/garden/commit/8191aa8))
* created local-kubernetes plugin and added config options ([1fcf88d](https://github.com/garden-io/garden/commit/1fcf88d))
* Detect circular dependencies. ([4a35276](https://github.com/garden-io/garden/commit/4a35276))
* pass parent to nested log entries ([41cddf0](https://github.com/garden-io/garden/commit/41cddf0))
* **cli:** validate option flags ([8c249bd](https://github.com/garden-io/garden/commit/8c249bd))
* plugins can now add modules to a project ([26f38c7](https://github.com/garden-io/garden/commit/26f38c7))
* support and documentation for Minikube ([b2c632c](https://github.com/garden-io/garden/commit/b2c632c))
* template variables can now access provider name and config ([51e2f33](https://github.com/garden-io/garden/commit/51e2f33))
* user no longer needs to run `env config` command ([8cb6512](https://github.com/garden-io/garden/commit/8cb6512))


### Performance Improvements

* made tests run quite a bit faster ([1aa69fd](https://github.com/garden-io/garden/commit/1aa69fd))


### BREAKING CHANGES

* This includes some changes to the project schema and how it is resolved,
as well as how the main `Garden` class is instantiated. The `Garden`
class is now called with an environment name, which is then fixed for
the session. The env configuration is resolved by merging the specific
environment configuration with a global configuration specified on the
new `global` key in the project config. The schema for the `providers`
key also different - its keys should now match plugin names, and
contain configuration for those plugins.



