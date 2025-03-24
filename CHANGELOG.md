
<a name="0.13.56"></a>
## [0.13.56](https://github.com/garden-io/garden/compare/0.13.55...0.13.56) (2025-03-23)

### Bug Fixes

* add deprecation for action volume references, as that's implied when deprecating `persistentvolumeclaim` and `configmap` action types ([#6976](https://github.com/garden-io/garden/issues/6976))
* reduce scope of the `build` deprecation to the `container` type ([#6972](https://github.com/garden-io/garden/issues/6972))

### Improvements

* **core**: fixes to output reference logic ([#6983](https://github.com/garden-io/garden/issues/6983))

<a name="0.13.55"></a>
## [0.13.55](https://github.com/garden-io/garden/compare/0.13.54...0.13.55) (2025-03-11)

### Bug Fixes

* improve error message when servicePort does not reference a port by name ([#6894](https://github.com/garden-io/garden/issues/6894)) ([6e0cf71c5](https://github.com/garden-io/garden/commit/6e0cf71c5))
* **build-staging:** fix the detection of paths to be deleted ([#6904](https://github.com/garden-io/garden/issues/6904)) ([ee976ad2b](https://github.com/garden-io/garden/commit/ee976ad2b))
* **config:** throw validation errors when encountering unknown keys in action configs ([#6875](https://github.com/garden-io/garden/issues/6875)) ([06448a086](https://github.com/garden-io/garden/commit/06448a086))
* **core:** always suppress logs when `--output` is used ([#6909](https://github.com/garden-io/garden/issues/6909)) ([3434a55dd](https://github.com/garden-io/garden/commit/3434a55dd))
* **docs:** propagate correct action kind to k8s Run/Test reference docs ([#6923](https://github.com/garden-io/garden/issues/6923)) ([08b0eeaa6](https://github.com/garden-io/garden/commit/08b0eeaa6))
* **k8s:** improve error message when servicePort does not reference a port by name ([#6894](https://github.com/garden-io/garden/issues/6894)) ([6e0cf71c5](https://github.com/garden-io/garden/commit/6e0cf71c5))
* **k8s:** respect `spec.cacheResult` flag in `kubernetes-pod` Test actions ([#6924](https://github.com/garden-io/garden/issues/6924))
* **k8s:** do not cache duplicate logs in Run and Test results ([#6927](https://github.com/garden-io/garden/issues/6927))

### Features

* **cli:** add more fields to garden get actions detailed output ([#6903](https://github.com/garden-io/garden/issues/6903)) ([1f4de4e3b](https://github.com/garden-io/garden/commit/1f4de4e3b))
* **container:** add `cacheResult` config option  for `container` Test actions ([#6925](https://github.com/garden-io/garden/issues/6925)) ([6c0f8f019](https://github.com/garden-io/garden/commit/6c0f8f019))

### Improvements

* **k8s:** improve logs when maximum retry attempts exceeded ([#6888](https://github.com/garden-io/garden/issues/6888)) ([305958e5a](https://github.com/garden-io/garden/commit/305958e5a))

<a name="0.13.54"></a>
## [0.13.54](https://github.com/garden-io/garden/compare/0.13.53...0.13.54) (2025-02-20)

### Bug Fixes

* correct source mapping in varfiles ([#6870](https://github.com/garden-io/garden/issues/6870)) ([994d78fb4](https://github.com/garden-io/garden/commit/994d78fb4))
* fix regression in cmd result processing ([#6867](https://github.com/garden-io/garden/issues/6867)) ([f2f80ca64](https://github.com/garden-io/garden/commit/f2f80ca64))
* do not consider implicit dependencies from action references in dead code branches ([#6862](https://github.com/garden-io/garden/issues/6862)) ([b4ee79178](https://github.com/garden-io/garden/commit/b4ee79178))
* dependency error message rendering ([#6847](https://github.com/garden-io/garden/issues/6847)) ([c7da2f2ac](https://github.com/garden-io/garden/commit/c7da2f2ac))
* mute false-positive deprecation warning for `deploymentStrategy` ([#6845](https://github.com/garden-io/garden/issues/6845)) ([583354785](https://github.com/garden-io/garden/commit/583354785))
* **dev:** fix unresolved templates in cmd results ([#6850](https://github.com/garden-io/garden/issues/6850)) ([4a2cd9c25](https://github.com/garden-io/garden/commit/4a2cd9c25))
* **k8s:** crash if `spec.files` in a `kubernetes` `Deploy` action is a template value ([#6868](https://github.com/garden-io/garden/issues/6868)) ([74f2efde6](https://github.com/garden-io/garden/commit/74f2efde6))
* **template:** propagate condition recursively in `conditionallyDeepEvaluate` ([#6852](https://github.com/garden-io/garden/issues/6852)) ([9ad03742e](https://github.com/garden-io/garden/commit/9ad03742e))
* **template:** parse template strings in varfiles ([#6844](https://github.com/garden-io/garden/issues/6844)) ([f855d91c1](https://github.com/garden-io/garden/commit/f855d91c1))

### Improvements

* **terraform:** support dynamic backends ([#6828](https://github.com/garden-io/garden/issues/6828)) ([9cb1c1ec3](https://github.com/garden-io/garden/commit/9cb1c1ec3))
* **terraform:** enable streaming logs to cloud ([#6829](https://github.com/garden-io/garden/issues/6829)) ([0fac9d064](https://github.com/garden-io/garden/commit/0fac9d064))

<a name="0.13.53"></a>
## [0.13.53](https://github.com/garden-io/garden/compare/0.13.52...0.13.53) (2025-02-06)

### Bug Fixes

* validate secrets before action resolution ([#6822](https://github.com/garden-io/garden/issues/6822)) ([55e7308d2](https://github.com/garden-io/garden/commit/55e7308d2))
* **cluster-buildkit:** assume image needs rebuild if skopeo command fails and print a warning ([#6810](https://github.com/garden-io/garden/issues/6810)) ([a8918e3c3](https://github.com/garden-io/garden/commit/a8918e3c3))

### Features

* allow cross-referencing variables in the same scope ([#6814](https://github.com/garden-io/garden/issues/6814)) ([463a758f2](https://github.com/garden-io/garden/commit/463a758f2))

### Performance Improvements

* improve preprocess action perf by only resolving template strings when absolutely needed ([#6745](https://github.com/garden-io/garden/issues/6745)) ([c968c6164](https://github.com/garden-io/garden/commit/c968c6164))

<a name="0.13.52"></a>
## [0.13.52](https://github.com/garden-io/garden/compare/0.13.51...0.13.52) (2025-01-30)

### Bug Fixes

* broken path inside window binary zipped file ([#6812](https://github.com/garden-io/garden/issues/6812)) ([fe2fbdaee](https://github.com/garden-io/garden/commit/fe2fbdaee))

### Improvements

* **k8s:** update ingress controller to 1.12.0 (Helm chart 4.12.0) ([#6789](https://github.com/garden-io/garden/issues/6789)) ([ca9deca68](https://github.com/garden-io/garden/commit/ca9deca68))

<a name="0.13.51"></a>
## [0.13.51](https://github.com/garden-io/garden/compare/0.13.50...0.13.51) (2025-01-28)

### Improvements

* add better error handling when failing to archive test artifacts ([#6802](https://github.com/garden-io/garden/issues/6802)) ([589cb3926](https://github.com/garden-io/garden/commit/589cb3926))

<a name="0.13.50"></a>
## [0.13.50](https://github.com/garden-io/garden/compare/0.13.49...0.13.50) (2025-01-24)

### Bug Fixes

* when using create project, the project name is undefined ([#6797](https://github.com/garden-io/garden/issues/6797)) ([39a6345f5](https://github.com/garden-io/garden/commit/39a6345f5))
* do not crash on missing `deploymentRegistry` for in-cluster builds ([#6768](https://github.com/garden-io/garden/issues/6768)) ([c55486ddd](https://github.com/garden-io/garden/commit/c55486ddd))
* **container:** respect deployment registry in publishId if not explicitly set ([#6690](https://github.com/garden-io/garden/issues/6690)) ([0c8ec05d4](https://github.com/garden-io/garden/commit/0c8ec05d4))
* **k8s:** do not throw if paused resource is missing ([#6799](https://github.com/garden-io/garden/issues/6799)) ([62b77ed67](https://github.com/garden-io/garden/commit/62b77ed67))
* **k8s:** ensure image pull secret is always created for K8s Deploy ([#6795](https://github.com/garden-io/garden/issues/6795)) ([6898536d8](https://github.com/garden-io/garden/commit/6898536d8))

### Improvements

* improvement(framework): always run prepareEnvironment handler [#6706](https://github.com/garden-io/garden/issues/6706) ([0c18a0e97](https://github.com/garden-io/garden/commit/0c18a0e97))

<a name="0.13.49"></a>
## [0.13.49](https://github.com/garden-io/garden/compare/0.13.48...0.13.49) (2025-01-14)

### Bug Fixes

* use non-legacy build staging file sync on Windows by default ([#6758](https://github.com/garden-io/garden/issues/6758)) ([4c83cd388](https://github.com/garden-io/garden/commit/4c83cd388))
* **core:** emit namespaceStatus events during provider init ([#6759](https://github.com/garden-io/garden/issues/6759)) ([c704a356e](https://github.com/garden-io/garden/commit/c704a356e))

### Improvements

* **core:** print project name with init log ([#6756](https://github.com/garden-io/garden/issues/6756)) ([67123d158](https://github.com/garden-io/garden/commit/67123d158))

<a name="0.13.48"></a>
## [0.13.48](https://github.com/garden-io/garden/compare/0.13.47...0.13.48) (2025-01-09)

### Bug Fixes

* resolve parts of template strings, even if another part cannot be resolved yet. ([#6751](https://github.com/garden-io/garden/issues/6751)) ([aabebbd03](https://github.com/garden-io/garden/commit/aabebbd03))

### Features

* allow overriding `source.path` in remote actions (when using `source.repository`) ([#6750](https://github.com/garden-io/garden/issues/6750)) ([20a4ba3b8](https://github.com/garden-io/garden/commit/20a4ba3b8))
* **pulumi:** enable new varfile schema for modules ([#6735](https://github.com/garden-io/garden/issues/6735)) ([bf74500a9](https://github.com/garden-io/garden/commit/bf74500a9))
* **pulumi:** add new pulumi varfile schema that allows specifying other top-level keys ([#6729](https://github.com/garden-io/garden/issues/6729)) ([f014cb666](https://github.com/garden-io/garden/commit/f014cb666))

### Performance Improvements

* optimise solver graph evaluation loop ([#6728](https://github.com/garden-io/garden/issues/6728)) ([bd6c6ba0d](https://github.com/garden-io/garden/commit/bd6c6ba0d))

<a name="0.13.47"></a>
## [0.13.47](https://github.com/garden-io/garden/compare/0.13.46...0.13.47) (2024-12-12)

### Bug Fixes

* make sure to display the mutagen version update warning message ([#6715](https://github.com/garden-io/garden/issues/6715)) ([9d971d255](https://github.com/garden-io/garden/commit/9d971d255))
* **template:** establish backwards bug-compatibility for kubernetes manifest files ([#6713](https://github.com/garden-io/garden/issues/6713)) ([424b39220](https://github.com/garden-io/garden/commit/424b39220))
* **templates:** fix regression with multiple if statements introduced in 0.13.46 ([#6714](https://github.com/garden-io/garden/issues/6714)) ([7fbe71779](https://github.com/garden-io/garden/commit/7fbe71779))

<a name="0.13.46"></a>
## [0.13.46](https://github.com/garden-io/garden/compare/0.13.45...0.13.46) (2024-12-11)

### Bug Fixes

* retain bug-compatibility for referencing missing variables in unary operators (`!` and `typeof`). ([#6695](https://github.com/garden-io/garden/issues/6695)) ([063eb9276](https://github.com/garden-io/garden/commit/063eb9276))
* improve error message if filter expression in foreach cannot be resolved ([#6694](https://github.com/garden-io/garden/issues/6694)) ([3ff5ee07a](https://github.com/garden-io/garden/commit/3ff5ee07a))
* if block expression backwards compat ([#6693](https://github.com/garden-io/garden/issues/6693)) ([67b99ac64](https://github.com/garden-io/garden/commit/67b99ac64))
* **k8s-exec:** use containerName if specified for kubernetes-exec actions ([#6682](https://github.com/garden-io/garden/issues/6682)) ([976ab7037](https://github.com/garden-io/garden/commit/976ab7037))
* **local-k8s:** ensure correct nginx status when getting env status ([#6696](https://github.com/garden-io/garden/issues/6696)) ([3c65e4900](https://github.com/garden-io/garden/commit/3c65e4900))
* **publish:** copy image from registry if it has been pushed directly after build ([#6681](https://github.com/garden-io/garden/issues/6681)) ([405940e9e](https://github.com/garden-io/garden/commit/405940e9e))
* **template:** fix template string escaping ([#6705](https://github.com/garden-io/garden/issues/6705)) ([32f8ec66e](https://github.com/garden-io/garden/commit/32f8ec66e))

### Bundled Tool Version Updates

* **mutagen:** update version to 0.18.0 ([#6665](https://github.com/garden-io/garden/issues/6665)) ([2e2792574](https://github.com/garden-io/garden/commit/2e2792574))

### Features

* **cli:** allow generating flamegraphs for performance analysis ([#6684](https://github.com/garden-io/garden/issues/6684)) ([2fdad584a](https://github.com/garden-io/garden/commit/2fdad584a))

### Improvements

* Point to YAML file for template string error messages if possible ([#6692](https://github.com/garden-io/garden/issues/6692)) ([a9c205bd8](https://github.com/garden-io/garden/commit/a9c205bd8))

### Performance Improvements

* optimise template string resolving performance ([#6685](https://github.com/garden-io/garden/issues/6685)) ([a34856491](https://github.com/garden-io/garden/commit/a34856491))
* improve graph resolve performance ([#6670](https://github.com/garden-io/garden/issues/6670)) ([4e4cd91e0](https://github.com/garden-io/garden/commit/4e4cd91e0))
* **framework:** avoid unnecessary config graph cloning ([#6667](https://github.com/garden-io/garden/issues/6667)) ([f15dd911d](https://github.com/garden-io/garden/commit/f15dd911d))

<a name="0.13.45"></a>
## [0.13.45](https://github.com/garden-io/garden/compare/0.13.44...0.13.45) (2024-11-20)

<a name="0.13.44"></a>
## [0.13.44](https://github.com/garden-io/garden/compare/0.13.43...0.13.44) (2024-11-20)

### Bug Fixes

* fix user prompt function ([#6613](https://github.com/garden-io/garden/issues/6613)) ([16ca20442](https://github.com/garden-io/garden/commit/16ca20442))
* **container:** container registry namespace is empty when not specified ([#6638](https://github.com/garden-io/garden/issues/6638)) ([439559853](https://github.com/garden-io/garden/commit/439559853))
* **k8s:** respect pod selector in kubernetes-exec action type ([#6657](https://github.com/garden-io/garden/issues/6657)) ([3e680e036](https://github.com/garden-io/garden/commit/3e680e036))

### Bundled Tool Version Updates

* **helm:** update version to 3.16.2 ([#6624](https://github.com/garden-io/garden/issues/6624)) ([cfbef2fe3](https://github.com/garden-io/garden/commit/cfbef2fe3))
* **kubectl:** update version to 1.31.2 ([#6623](https://github.com/garden-io/garden/issues/6623)) ([a44ea9929](https://github.com/garden-io/garden/commit/a44ea9929))
* **mutagen:** update version to 0.18.0 ([#6655](https://github.com/garden-io/garden/issues/6655)) ([327f48485](https://github.com/garden-io/garden/commit/327f48485))

### Features

* **k8s:** show Helm events and logs ([#6626](https://github.com/garden-io/garden/issues/6626)) ([0f7bf25aa](https://github.com/garden-io/garden/commit/0f7bf25aa))

<a name="0.13.43"></a>
## [0.13.43](https://github.com/garden-io/garden/compare/0.13.42...0.13.43) (2024-10-30)

### Bug Fixes

* correct deploy action validation in container plugin extension ([#6606](https://github.com/garden-io/garden/issues/6606)) ([ba2a4954a](https://github.com/garden-io/garden/commit/ba2a4954a))
* render action reference in error message ([#6605](https://github.com/garden-io/garden/issues/6605)) ([4ebe9975a](https://github.com/garden-io/garden/commit/4ebe9975a))
* **k8s:** correctly set image pull secret on sync pod ([#6533](https://github.com/garden-io/garden/issues/6533)) ([a2826a947](https://github.com/garden-io/garden/commit/a2826a947))
* **k8s:** add imagePullSecret from kubernetes provider to sync init container ([#6530](https://github.com/garden-io/garden/issues/6530)) ([07a577ef4](https://github.com/garden-io/garden/commit/07a577ef4))
* **profiler:** fix sync profiler and collect more data ([#6586](https://github.com/garden-io/garden/issues/6586)) ([04dcc006c](https://github.com/garden-io/garden/commit/04dcc006c))
* **pulumi:** stack not being selected before getting outputs when autoApply = false ([#6554](https://github.com/garden-io/garden/issues/6554)) ([8fd42f3b3](https://github.com/garden-io/garden/commit/8fd42f3b3))
* **pulumi:** prevent existing pulumi configs from being overwritten ([#6526](https://github.com/garden-io/garden/issues/6526)) ([dcfef40c6](https://github.com/garden-io/garden/commit/dcfef40c6))

### Features

* **exec:** separate `stdout` and `stderr` in Run and Test `exec`-action outputs ([#6572](https://github.com/garden-io/garden/issues/6572)) ([5a04f60ac](https://github.com/garden-io/garden/commit/5a04f60ac))
* **k8s:** allow using registry mirror for utility images ([#6552](https://github.com/garden-io/garden/issues/6552)) ([122371dd6](https://github.com/garden-io/garden/commit/122371dd6))
* **pulumi:** add `spec.showSecretsInOutput` config to Pulumi deploy action ([#6555](https://github.com/garden-io/garden/issues/6555)) ([682e37896](https://github.com/garden-io/garden/commit/682e37896))

### Improvements

* make sure artifacts are always fetched ([#6532](https://github.com/garden-io/garden/issues/6532)) ([593c9cbdf](https://github.com/garden-io/garden/commit/593c9cbdf))
* **api:** send action type to cloud ([#5447](https://github.com/garden-io/garden/issues/5447)) ([15fe97404](https://github.com/garden-io/garden/commit/15fe97404))

### Performance Improvements

* optimize action configs processing ([#6547](https://github.com/garden-io/garden/issues/6547)) ([af6df50a8](https://github.com/garden-io/garden/commit/af6df50a8))
* **git:** use `sub-tree` scan mode for config files scan ([#6483](https://github.com/garden-io/garden/issues/6483)) ([131663140](https://github.com/garden-io/garden/commit/131663140))

<a name="0.13.42"></a>
## [0.13.42](https://github.com/garden-io/garden/compare/0.13.41...0.13.42) (2024-10-08)

### Bug Fixes

* misleading warning message when cloud session is expired ([#6503](https://github.com/garden-io/garden/issues/6503)) ([8359ae334](https://github.com/garden-io/garden/commit/8359ae334))
* **otel:** ensure OTEL sends final span when -o opt is used ([#6505](https://github.com/garden-io/garden/issues/6505)) ([7b96bdb64](https://github.com/garden-io/garden/commit/7b96bdb64))

### Bundled Tool Version Updates

* **images:** update `buildkit` image to fix CVE-2023-44487 ([#6522](https://github.com/garden-io/garden/issues/6522)) ([b75370551](https://github.com/garden-io/garden/commit/b75370551))
* **kubectl:** update version to 1.30.4 ([#6519](https://github.com/garden-io/garden/issues/6519)) ([86a644788](https://github.com/garden-io/garden/commit/86a644788))

<a name="0.13.41"></a>
## [0.13.41](https://github.com/garden-io/garden/compare/0.13.40...0.13.41) (2024-09-26)

### Bug Fixes

* **core:** avoid crash when using `copyFrom` together with symlinks ([#6485](https://github.com/garden-io/garden/issues/6485)) ([a7f0420ec](https://github.com/garden-io/garden/commit/a7f0420ec))
* **sync:** use right arch of `mutagen-agent` binary in `k8s-sync` image ([#6465](https://github.com/garden-io/garden/issues/6465)) ([66e5a7530](https://github.com/garden-io/garden/commit/66e5a7530))

### Performance Improvements

* **git:** avoid unnecessary file hashing while config files detection ([#6461](https://github.com/garden-io/garden/issues/6461)) ([a786a5047](https://github.com/garden-io/garden/commit/a786a5047))

<a name="0.13.40"></a>
## [0.13.40](https://github.com/garden-io/garden/compare/0.13.39...0.13.40) (2024-09-18)

### Bug Fixes

* avoid throwing 401 when trying to login to cloud ([#6447](https://github.com/garden-io/garden/issues/6447)) ([728077060](https://github.com/garden-io/garden/commit/728077060))
* reproduce symlinks in build staging correctly on windows ([#6433](https://github.com/garden-io/garden/issues/6433)) ([e4adc6b1c](https://github.com/garden-io/garden/commit/e4adc6b1c))
* allow relative symlinks to directories when using build staging ([#6430](https://github.com/garden-io/garden/issues/6430)) ([26644fcf5](https://github.com/garden-io/garden/commit/26644fcf5))
* add applyArgs to kubectl apply function ([#6385](https://github.com/garden-io/garden/issues/6385)) ([f140ab2d7](https://github.com/garden-io/garden/commit/f140ab2d7))
* **sync:** correct search path for mutagen faux ssh ([#6421](https://github.com/garden-io/garden/issues/6421)) ([74f7ef211](https://github.com/garden-io/garden/commit/74f7ef211))
* **template:** avoid premature `disabled` flag evaluation on actions ([#6448](https://github.com/garden-io/garden/issues/6448)) ([c0e9065ad](https://github.com/garden-io/garden/commit/c0e9065ad))

<a name="0.13.39"></a>
## [0.13.39](https://github.com/garden-io/garden/compare/0.13.38...0.13.39) (2024-08-29)

### Bug Fixes

* **examples:** remove invalid action dependency from pulumi example ([#6384](https://github.com/garden-io/garden/issues/6384)) ([445d7d377](https://github.com/garden-io/garden/commit/445d7d377))
* **template:** keep action variables when resolving disabled flag ([#6406](https://github.com/garden-io/garden/issues/6406)) ([0b8b0497b](https://github.com/garden-io/garden/commit/0b8b0497b))
* **template:** fix template string escaping and resolution in Module configs ([#6408](https://github.com/garden-io/garden/issues/6408)) ([8df80152a](https://github.com/garden-io/garden/commit/8df80152a))
* **template:** unescape escape templates when not doing partial resolution ([#5680](https://github.com/garden-io/garden/issues/5680)) ([cc6e41c3a](https://github.com/garden-io/garden/commit/cc6e41c3a))

<a name="0.13.38"></a>
## [0.13.38](https://github.com/garden-io/garden/compare/0.13.37...0.13.38) (2024-08-15)

### Bug Fixes

* improve error message when k8s token expired ([#6382](https://github.com/garden-io/garden/issues/6382)) ([bd2b94382](https://github.com/garden-io/garden/commit/bd2b94382))
* **pulumi:** fix process spawn machinery in Pulumi plugin ([#6377](https://github.com/garden-io/garden/issues/6377)) ([76bdbec72](https://github.com/garden-io/garden/commit/76bdbec72))
* **testResult:** transform undefined to null when serializing test result ([#6380](https://github.com/garden-io/garden/issues/6380)) ([883df510e](https://github.com/garden-io/garden/commit/883df510e))

### Bundled Tool Version Updates

* **docker:** update bundled Docker CLI to 27.1.1 ([#6368](https://github.com/garden-io/garden/issues/6368)) ([2587afdb0](https://github.com/garden-io/garden/commit/2587afdb0))

<a name="0.13.37"></a>
## [0.13.37](https://github.com/garden-io/garden/compare/0.13.36...0.13.37) (2024-08-09)

### Bug Fixes

* **dev:** fix custom commands not working in dev console ([#6341](https://github.com/garden-io/garden/issues/6341)) ([6c71c507a](https://github.com/garden-io/garden/commit/6c71c507a))
* **template:** null-safe error message extraction ([#6358](https://github.com/garden-io/garden/issues/6358)) ([98b50698c](https://github.com/garden-io/garden/commit/98b50698c))

### Improvements

* update kubernetes-client library to version with better auth error handling ([#6343](https://github.com/garden-io/garden/issues/6343)) ([c5f56d9ec](https://github.com/garden-io/garden/commit/c5f56d9ec))
* add error handler callback to podRunner log streams ([#6339](https://github.com/garden-io/garden/issues/6339)) ([c045254da](https://github.com/garden-io/garden/commit/c045254da))
<a name="0.13.36"></a>
## [0.13.36](https://github.com/garden-io/garden/compare/0.13.35...0.13.36) (2024-08-01)

### Bug Fixes

* **exec:** fix error handling in exec run and test actions ([#6319](https://github.com/garden-io/garden/issues/6319)) ([6a0343027](https://github.com/garden-io/garden/commit/6a0343027))
* **profiler:** handle getters and setters in `[@Profile](https://github.com/Profile)` decorator ([#6318](https://github.com/garden-io/garden/issues/6318)) ([aa3ddcce2](https://github.com/garden-io/garden/commit/aa3ddcce2))
* **sync:** ensure the sync daemon env is configured correctly ([#6302](https://github.com/garden-io/garden/issues/6302)) ([8e3e02fa8](https://github.com/garden-io/garden/commit/8e3e02fa8))

### Improvements

* **cli:** `GARDEN_DISABLE_WEB_APP_WARN` flag to mute cloud login warn ([#6320](https://github.com/garden-io/garden/issues/6320)) ([41574727a](https://github.com/garden-io/garden/commit/41574727a))
* **cli:** add GARDEN_IGNORE_UNCAUGHT_EXCEPTION ([#6337](https://github.com/garden-io/garden/issues/6337)) ([0e19c950a](https://github.com/garden-io/garden/commit/0e19c950a))
* **cli:** node extra params via env ([#6336](https://github.com/garden-io/garden/issues/6336)) ([2545d317d](https://github.com/garden-io/garden/commit/2545d317d))

<a name="0.13.35"></a>
## [0.13.35](https://github.com/garden-io/garden/compare/0.13.34...0.13.35) (2024-07-18)

### Bug Fixes

* retain original process env when call `spawn` helper ([#6301](https://github.com/garden-io/garden/issues/6301)) ([593b3e426](https://github.com/garden-io/garden/commit/593b3e426))
* resolve `disabled` action flag before duplicate action names validation ([#6293](https://github.com/garden-io/garden/issues/6293)) ([fa3da74b1](https://github.com/garden-io/garden/commit/fa3da74b1))
* **examples:** mention in READMEs that build deps need to be set ([#6280](https://github.com/garden-io/garden/issues/6280)) ([cdbd6bd46](https://github.com/garden-io/garden/commit/cdbd6bd46))
* **exec:** remove duplicate logging ([#6298](https://github.com/garden-io/garden/issues/6298)) ([02ef1766f](https://github.com/garden-io/garden/commit/02ef1766f))
* **template:** use stricter context for `disabled` flag resolution ([#6295](https://github.com/garden-io/garden/issues/6295)) ([e8e0b8638](https://github.com/garden-io/garden/commit/e8e0b8638))

### Bundled Tool Version Updates

* **helm:** update version to 3.15.3 ([#6296](https://github.com/garden-io/garden/issues/6296)) ([d4a6807e6](https://github.com/garden-io/garden/commit/d4a6807e6))

### Features

* **container:** first-class BuildKit secrets support ([#6294](https://github.com/garden-io/garden/issues/6294)) ([9e1ac291b](https://github.com/garden-io/garden/commit/9e1ac291b))
* **kubernetes:** plugin command to remove `garden-util` resources ([#6278](https://github.com/garden-io/garden/issues/6278)) ([4f8a2d6d2](https://github.com/garden-io/garden/commit/4f8a2d6d2))

### Improvements

* **cli:** display hint on missing action error ([#6279](https://github.com/garden-io/garden/issues/6279)) ([861a7eedd](https://github.com/garden-io/garden/commit/861a7eedd))

<a name="0.13.34"></a>
## [0.13.34](https://github.com/garden-io/garden/compare/0.13.33...0.13.34) (2024-07-09)

### Bug Fixes

* print action version in logs while status check ([#6257](https://github.com/garden-io/garden/issues/6257)) ([42e046ba1](https://github.com/garden-io/garden/commit/42e046ba1))
* **cloudbuilder:** add error handling to fallback to cli install of buildx builder ([#6258](https://github.com/garden-io/garden/issues/6258)) ([6f4b120ce](https://github.com/garden-io/garden/commit/6f4b120ce))
* **git:** use consistent cache keys for paths with symlinks ([#6262](https://github.com/garden-io/garden/issues/6262)) ([e6112bc4d](https://github.com/garden-io/garden/commit/e6112bc4d))
* **kubernetes-plugin:** sanitize volumes configuration for helm and kubernetes type pod runners ([#6251](https://github.com/garden-io/garden/issues/6251)) ([0a12df4bb](https://github.com/garden-io/garden/commit/0a12df4bb))
* **pulumi:** include build deps in plugin commands ([#6260](https://github.com/garden-io/garden/issues/6260)) ([1e5c1df23](https://github.com/garden-io/garden/commit/1e5c1df23))

### Bundled Tool Version Updates

* **conftest:** exclude `conftest` from Docker images ([#6248](https://github.com/garden-io/garden/issues/6248)) ([c04e92c0b](https://github.com/garden-io/garden/commit/c04e92c0b))
* **helm:** update version to 3.15.2 ([#6245](https://github.com/garden-io/garden/issues/6245)) ([c47fa4cd1](https://github.com/garden-io/garden/commit/c47fa4cd1))
* **kubectl:** update version to 1.30.2 ([#6255](https://github.com/garden-io/garden/issues/6255)) ([7bc15126e](https://github.com/garden-io/garden/commit/7bc15126e))
* **pulumi:** switch default version to 3.122.0 ([#6252](https://github.com/garden-io/garden/issues/6252)) ([225bc8943](https://github.com/garden-io/garden/commit/225bc8943))
* **pulumi:** switch default version to 3.102.0 ([#6246](https://github.com/garden-io/garden/issues/6246)) ([fd7d62a0c](https://github.com/garden-io/garden/commit/fd7d62a0c))

### Features

* Windows support for cloud builder ([#6211](https://github.com/garden-io/garden/issues/6211)) ([14a90ac08](https://github.com/garden-io/garden/commit/14a90ac08))

### Improvements

* **sync:** use native Mutagen daemon by default ([#6227](https://github.com/garden-io/garden/issues/6227)) ([b33d9c8bd](https://github.com/garden-io/garden/commit/b33d9c8bd))

<a name="0.13.33"></a>
## [0.13.33](https://github.com/garden-io/garden/compare/0.13.32...0.13.33) (2024-06-25)

### Bug Fixes

* **pulumi:** fix dependency resolution when `--skip-dependencies` is on ([#6229](https://github.com/garden-io/garden/issues/6229)) ([ece011965](https://github.com/garden-io/garden/commit/ece011965))
* **pulumi:** respect `--skip-dependencies` flag in `preview` command ([#6226](https://github.com/garden-io/garden/issues/6226)) ([f12c8ab80](https://github.com/garden-io/garden/commit/f12c8ab80))
* **template:** allow partially resolved vars in arithmetic expressions ([#6228](https://github.com/garden-io/garden/issues/6228)) ([8d85a1a32](https://github.com/garden-io/garden/commit/8d85a1a32))

<a name="0.13.32"></a>
## [0.13.32](https://github.com/garden-io/garden/compare/0.13.31...0.13.32) (2024-06-25)

### Bug Fixes

* 🐛 load valuefiles from config file location ([#6156](https://github.com/garden-io/garden/issues/6156)) ([52dc2b1a0](https://github.com/garden-io/garden/commit/52dc2b1a0))
* handling varfiles in remote actions ([#6147](https://github.com/garden-io/garden/issues/6147)) ([4d9026f74](https://github.com/garden-io/garden/commit/4d9026f74))
* allow dashes in kaniko options ([#6149](https://github.com/garden-io/garden/issues/6149)) ([5eaffa312](https://github.com/garden-io/garden/commit/5eaffa312))
* **git:** fix repo scan result caching ([#6179](https://github.com/garden-io/garden/issues/6179)) ([c276e86c2](https://github.com/garden-io/garden/commit/c276e86c2))
* **jib:** set `localId` in JIB module-to-action converter ([#6210](https://github.com/garden-io/garden/issues/6210)) ([0eeb4c14d](https://github.com/garden-io/garden/commit/0eeb4c14d))

### Bundled Tool Version Updates

* **kuztomize:** support version `5.4.2` and use it by default ([#6144](https://github.com/garden-io/garden/issues/6144)) ([98a5504c6](https://github.com/garden-io/garden/commit/98a5504c6))
* **kuztomize:** update version to `4.5.7` ([#6131](https://github.com/garden-io/garden/issues/6131)) ([0a8e39851](https://github.com/garden-io/garden/commit/0a8e39851))
* **mutagen:** update to version `0.17.6` ([#6145](https://github.com/garden-io/garden/issues/6145)) ([0778c7596](https://github.com/garden-io/garden/commit/0778c7596))
* **sync:** print warn on upcoming code sync daemon change ([#6155](https://github.com/garden-io/garden/issues/6155)) ([d0a99da88](https://github.com/garden-io/garden/commit/d0a99da88))

### Features

* add building and publishing multi-platform images ([#6208](https://github.com/garden-io/garden/issues/6208)) ([445de8706](https://github.com/garden-io/garden/commit/445de8706))
* add allowFailure option for workflow steps ([#6114](https://github.com/garden-io/garden/issues/6114)) ([70b8ca870](https://github.com/garden-io/garden/commit/70b8ca870))

### Improvements

* **core:** fix missing action type err msg ([#6176](https://github.com/garden-io/garden/issues/6176)) ([f5c55143e](https://github.com/garden-io/garden/commit/f5c55143e))
* **docs:** do not use `build` field in migration guide ([#6207](https://github.com/garden-io/garden/issues/6207)) ([491a83073](https://github.com/garden-io/garden/commit/491a83073))
* **sync:** better error handling with solution suggestion ([#6148](https://github.com/garden-io/garden/issues/6148)) ([da56d45d6](https://github.com/garden-io/garden/commit/da56d45d6))

<a name="0.13.31"></a>
## [0.13.31](https://github.com/garden-io/garden/compare/0.13.30...0.13.31) (2024-06-03)

### Bug Fixes

* `garden publish` command to respect `publishId` ([#6052](https://github.com/garden-io/garden/issues/6052)) ([e30ab0ba5](https://github.com/garden-io/garden/commit/e30ab0ba5))
* **actions:** return all outputs of an action as a json string ([#6067](https://github.com/garden-io/garden/issues/6067)) ([7c60c6b1b](https://github.com/garden-io/garden/commit/7c60c6b1b))
* **commands:** use statusOnly provider resolution for several read-only commands ([#6063](https://github.com/garden-io/garden/issues/6063)) ([c6bc3d788](https://github.com/garden-io/garden/commit/c6bc3d788))
* **core:** issue with partial module resolution and module templates ([#6073](https://github.com/garden-io/garden/issues/6073)) ([78f4d35e1](https://github.com/garden-io/garden/commit/78f4d35e1))
* **docs:** actualize `cloud secrets update` command description ([#6104](https://github.com/garden-io/garden/issues/6104)) ([daec250b1](https://github.com/garden-io/garden/commit/daec250b1))
* **images:** download tools with correct `TARGETARCH` for multi-platforom images ([#6079](https://github.com/garden-io/garden/issues/6079)) ([5a216f9ec](https://github.com/garden-io/garden/commit/5a216f9ec))
* **k8s:** prevent exec auth script errors on Windows ([#6120](https://github.com/garden-io/garden/issues/6120)) ([066798720](https://github.com/garden-io/garden/commit/066798720))
* **modules:** another fix for the experimental partial module resolution ([#6105](https://github.com/garden-io/garden/issues/6105)) ([974de64be](https://github.com/garden-io/garden/commit/974de64be))
* **provider:** allow initialising providers without write ops for validation command ([#6051](https://github.com/garden-io/garden/issues/6051)) ([2321ae8d6](https://github.com/garden-io/garden/commit/2321ae8d6))
* **secrets:** skip already existing secrets while creating ([#6099](https://github.com/garden-io/garden/issues/6099)) ([65ceb7c0d](https://github.com/garden-io/garden/commit/65ceb7c0d))
* **terraform:** prevent deadlock by consuming stdout ([#6037](https://github.com/garden-io/garden/issues/6037)) ([3640b4edd](https://github.com/garden-io/garden/commit/3640b4edd))

### Bundled Tool Version Updates

* **helm:** update version to `3.15.1` ([#6123](https://github.com/garden-io/garden/issues/6123)) ([17f5e0cb8](https://github.com/garden-io/garden/commit/17f5e0cb8))
* **kubectl:** update version to `1.30.1` ([#6122](https://github.com/garden-io/garden/issues/6122)) ([2ece3d194](https://github.com/garden-io/garden/commit/2ece3d194))

### Features

* allow custom args in `kubectl apply` for kubernetes deployments ([#6107](https://github.com/garden-io/garden/issues/6107)) ([85ab8e263](https://github.com/garden-io/garden/commit/85ab8e263))
* **images:** add multi-platform images for garden deployed services ([#6072](https://github.com/garden-io/garden/issues/6072)) ([76fa956d0](https://github.com/garden-io/garden/commit/76fa956d0))
* **template:** add date template helper functions ([#5997](https://github.com/garden-io/garden/issues/5997)) ([39d239661](https://github.com/garden-io/garden/commit/39d239661))

### Improvements

* **cli:** more detailed logging in `cloud secret` commands ([#6065](https://github.com/garden-io/garden/issues/6065)) ([20742f4f1](https://github.com/garden-io/garden/commit/20742f4f1))
* **helm:** use `--wait` when deploying ([#6078](https://github.com/garden-io/garden/issues/6078)) ([7a68373a1](https://github.com/garden-io/garden/commit/7a68373a1))
* **k8s:** allow volume mounts in runners ([#6112](https://github.com/garden-io/garden/issues/6112)) ([bac234b59](https://github.com/garden-io/garden/commit/bac234b59))

### Performance Improvements

* **cli:** avoid unnecessary module resolution when filtering by name ([#6002](https://github.com/garden-io/garden/issues/6002)) ([86c885f42](https://github.com/garden-io/garden/commit/86c885f42))
* **cli:** improve cli startup performance using v8 cache ([#6049](https://github.com/garden-io/garden/issues/6049)) ([7d8034b3b](https://github.com/garden-io/garden/commit/7d8034b3b))

<a name="0.13.30"></a>
## [0.13.30](https://github.com/garden-io/garden/compare/0.13.29...0.13.30) (2024-05-07)

### Bug Fixes

* **cli:** do not render hidden commands ([#5975](https://github.com/garden-io/garden/issues/5975)) ([053c78617](https://github.com/garden-io/garden/commit/053c78617))
* **cloud:** fix unprocessable entity error ([#5931](https://github.com/garden-io/garden/issues/5931)) ([bfcc1fea8](https://github.com/garden-io/garden/commit/bfcc1fea8))
* **git:** increase max proc buffer size and fix error handling ([#5916](https://github.com/garden-io/garden/issues/5916)) ([30fd9c077](https://github.com/garden-io/garden/commit/30fd9c077))
* **helm:** fix race condition when updating deps ([#6012](https://github.com/garden-io/garden/issues/6012)) ([dec8d6329](https://github.com/garden-io/garden/commit/dec8d6329))
* **helm:** disable `--atomic` by default in Helm modules ([#5968](https://github.com/garden-io/garden/issues/5968)) ([5f76a732d](https://github.com/garden-io/garden/commit/5f76a732d))
* **k8s:** work around a rare websocket connection issue & warn ([#5908](https://github.com/garden-io/garden/issues/5908)) ([d980ea8ee](https://github.com/garden-io/garden/commit/d980ea8ee))
* **sync:** fix typo in warning message ([#5919](https://github.com/garden-io/garden/issues/5919)) ([4936e33c2](https://github.com/garden-io/garden/commit/4936e33c2))

### Features

* optional varfiles ([#5996](https://github.com/garden-io/garden/issues/5996)) ([ee36cbbfb](https://github.com/garden-io/garden/commit/ee36cbbfb))
* **container:** experimental cloudbuilder support ([#5928](https://github.com/garden-io/garden/issues/5928)) ([3f288418a](https://github.com/garden-io/garden/commit/3f288418a))

### Improvements

* update bundled NodeJS runtime to `21.7.3` ([#6009](https://github.com/garden-io/garden/issues/6009)) ([bc38bb247](https://github.com/garden-io/garden/commit/bc38bb247))
* allow for more concurrency when using cloud builder ([#5955](https://github.com/garden-io/garden/issues/5955)) ([4717da8e5](https://github.com/garden-io/garden/commit/4717da8e5))
* **cloud:** more informative error message on CA cert problems ([#5941](https://github.com/garden-io/garden/issues/5941)) ([1d929625e](https://github.com/garden-io/garden/commit/1d929625e))
* **git:** avoid duplicate profiling of `GitHandler.hashObject` ([#5918](https://github.com/garden-io/garden/issues/5918)) ([a6554c611](https://github.com/garden-io/garden/commit/a6554c611))
* **helm:** update helm to `3.14.4` ([#5972](https://github.com/garden-io/garden/issues/5972)) ([456e89e58](https://github.com/garden-io/garden/commit/456e89e58))
* **jib:** update JDK LTS versions to the latest stable builds ([#5970](https://github.com/garden-io/garden/issues/5970)) ([a333a9e6d](https://github.com/garden-io/garden/commit/a333a9e6d))
* **k8s:** update `kubectl` version to `1.29.4` ([#5973](https://github.com/garden-io/garden/issues/5973)) ([5fff93d9d](https://github.com/garden-io/garden/commit/5fff93d9d))
* **support:** install docker-buildx-plugin in garden Docker images ([#5942](https://github.com/garden-io/garden/issues/5942)) ([0a86f6ed6](https://github.com/garden-io/garden/commit/0a86f6ed6))

<a name="0.13.29"></a>
## [0.13.29](https://github.com/garden-io/garden/compare/0.13.28...0.13.29) (2024-04-04)

### Bug Fixes

* recognize `--resolve` flag in `validate` command ([#5853](https://github.com/garden-io/garden/issues/5853)) ([af514b409](https://github.com/garden-io/garden/commit/af514b409))
* **core:** increase max event listener count ([#5889](https://github.com/garden-io/garden/issues/5889)) ([d29e11e25](https://github.com/garden-io/garden/commit/d29e11e25))
* **k8s:** allow specifying version for oci helm charts ([#5892](https://github.com/garden-io/garden/issues/5892)) ([43e7485bb](https://github.com/garden-io/garden/commit/43e7485bb))
* **vcs:** use structural path comparison to compute minimal repo roots ([#5867](https://github.com/garden-io/garden/issues/5867)) ([189bb2119](https://github.com/garden-io/garden/commit/189bb2119))

### Features

* **container:** allow global extra build flags e.g. for custom remote builders ([#5829](https://github.com/garden-io/garden/issues/5829)) ([7cef7c1b6](https://github.com/garden-io/garden/commit/7cef7c1b6))
* **helm:** store garden metadata in configmap instead of helm values ([#5827](https://github.com/garden-io/garden/issues/5827)) ([adcf96803](https://github.com/garden-io/garden/commit/adcf96803))
* **modules:** allow opting out of build staging ([#5890](https://github.com/garden-io/garden/issues/5890)) ([a4fdc3bfb](https://github.com/garden-io/garden/commit/a4fdc3bfb))

### Improvements

* **k8s:** better pod runner error handling ([#5903](https://github.com/garden-io/garden/issues/5903)) ([bb79cd74a](https://github.com/garden-io/garden/commit/bb79cd74a))

<a name="0.13.28"></a>
## [0.13.28](https://github.com/garden-io/garden/compare/0.13.27...0.13.28) (2024-03-11)

### Bug Fixes

* **core:** properly escape shell commands ([#5811](https://github.com/garden-io/garden/issues/5811)) ([a6d653404](https://github.com/garden-io/garden/commit/a6d653404))
* **docs:** fix ordering of image reference in actions outputs ([#5828](https://github.com/garden-io/garden/pull/5828)) ([1e7071857](https://github.com/garden-io/garden/commit/1e7071857416e9514646b68d70b8577c47b5ebaa))
* **k8s:** use the same service account for pulling images as building ([#5810](https://github.com/garden-io/garden/issues/5810)) ([dba5b0665](https://github.com/garden-io/garden/commit/dba5b0665))

### Improvements

* improvements to validate command ([#5809](https://github.com/garden-io/garden/issues/5809)) ([010730cef](https://github.com/garden-io/garden/commit/010730cef))
* * **docker:** update Docker shipped with Garden tools to 25.0.2

<a name="0.13.27"></a>
## [0.13.27](https://github.com/garden-io/garden/compare/0.13.26...0.13.27) (2024-03-04)

### Bug Fixes

* **buildkit:** remove liveness probe to avoid unnecessary restarts of buildkit ([#5779](https://github.com/garden-io/garden/pull/5779))
* **cloud:** correctly parse user ID when creating cloud secrets ([#5792](https://github.com/garden-io/garden/issues/5792)) ([519c90e93](https://github.com/garden-io/garden/commit/519c90e93))
* **k8s:** fix kubernetes workload rollout status check ([#5794](https://github.com/garden-io/garden/issues/5794)) ([445d25c23](https://github.com/garden-io/garden/commit/445d25c23))
* **k8s:** attempt execing on running pod ([#5782](https://github.com/garden-io/garden/issues/5782)) ([8b94e494e](https://github.com/garden-io/garden/commit/8b94e494e))
* **self-update:** download alpine release artifacts on alpine ([#5798](https://github.com/garden-io/garden/issues/5798)) ([418de1cbb](https://github.com/garden-io/garden/commit/418de1cbb))
* **template:** support template strings in `ConfigTemplate.configs` ([#5796](https://github.com/garden-io/garden/issues/5796)) ([bf51aa06b](https://github.com/garden-io/garden/commit/bf51aa06b))

### Features

* **util:** added profile-project command ([#5780](https://github.com/garden-io/garden/issues/5780)) ([c83f815fe](https://github.com/garden-io/garden/commit/c83f815fe))
* **sync:** deprecate non-interactive `sync start` and `stop` commands ([#5747](https://github.com/garden-io/garden/issues/5747)) ([6e1e97939](https://github.com/garden-io/garden/commit/6e1e97939))

<a name="0.13.26"></a>
## [0.13.26](https://github.com/garden-io/garden/compare/0.13.25...0.13.26) (2024-02-22)

### Bug Fixes

* do not fail on empty YAML varfiles ([#5759](https://github.com/garden-io/garden/issues/5759)) ([e5732aa5f](https://github.com/garden-io/garden/commit/e5732aa5f))
* **core:** better Zod validation error messages ([#5745](https://github.com/garden-io/garden/issues/5745)) ([dc49f10d4](https://github.com/garden-io/garden/commit/dc49f10d4))
* **core:** versioning fix for remote sources ([#5735](https://github.com/garden-io/garden/issues/5735)) ([91bfd4816](https://github.com/garden-io/garden/commit/91bfd4816))
* **k8s:** retry websocket errors ([#5755](https://github.com/garden-io/garden/issues/5755)) ([c8b88c4bd](https://github.com/garden-io/garden/commit/c8b88c4bd))
* **module-conversion:** skip omitted build deps ([#5727](https://github.com/garden-io/garden/issues/5727)) ([c734d0f38](https://github.com/garden-io/garden/commit/c734d0f38))
* **mutagen:** call mutagen commands from the right cwd ([#5734](https://github.com/garden-io/garden/issues/5734)) ([98a650db7](https://github.com/garden-io/garden/commit/98a650db7))

### Features

* **k8s:** support mode=max for AWS ECR with cluster-buildkit build mode ([#5758](https://github.com/garden-io/garden/issues/5758)) ([6a94cec3b](https://github.com/garden-io/garden/commit/6a94cec3b))

### Improvements

* **core:** less noisy missing dep errors ([#5732](https://github.com/garden-io/garden/issues/5732)) ([91d25bcae](https://github.com/garden-io/garden/commit/91d25bcae))
* **k8s:** update `kubectl` version to `1.29.2` ([#5756](https://github.com/garden-io/garden/issues/5756)) ([1f12b3fe0](https://github.com/garden-io/garden/commit/1f12b3fe0))
* **mutagen:** use faux SSH command to use original Mutagen ([#5551](https://github.com/garden-io/garden/issues/5551)) ([e778e9750](https://github.com/garden-io/garden/commit/e778e9750))
* **sync:** update Mutagen to 0.17.5 ([#5744](https://github.com/garden-io/garden/issues/5744)) ([eec7832b7](https://github.com/garden-io/garden/commit/eec7832b7))

<a name="0.13.25"></a>
## [0.13.25](https://github.com/garden-io/garden/compare/0.13.24...0.13.25) (2024-02-13)

### Bug Fixes

* **buildkit:** run command from context dir ([#5712](https://github.com/garden-io/garden/issues/5712)) ([f93ecc6e7](https://github.com/garden-io/garden/commit/f93ecc6e7))
* **ci:** macos cross build error ([#5694](https://github.com/garden-io/garden/issues/5694)) ([4de3cc27c](https://github.com/garden-io/garden/commit/4de3cc27c))
* **cli:** only overwrite terminal writer if using Ink ([#5688](https://github.com/garden-io/garden/issues/5688)) ([171912919](https://github.com/garden-io/garden/commit/171912919))
* **core:** don't execute disabled dependencies ([#5697](https://github.com/garden-io/garden/issues/5697)) ([5bcb0960b](https://github.com/garden-io/garden/commit/5bcb0960b))
* **get-config:** omit internal field from output ([#5716](https://github.com/garden-io/garden/issues/5716)) ([3b6579bac](https://github.com/garden-io/garden/commit/3b6579bac))
* **git:** fix file list caching bug for repo mode ([#5710](https://github.com/garden-io/garden/issues/5710)) ([ca7f997f4](https://github.com/garden-io/garden/commit/ca7f997f4))
* **k8s:** don't throw when log fetching fails ([#5690](https://github.com/garden-io/garden/issues/5690)) ([993431923](https://github.com/garden-io/garden/commit/993431923))

### Features

* **config:** add environments field on actions ([#5686](https://github.com/garden-io/garden/issues/5686)) ([a7bcf8c6b](https://github.com/garden-io/garden/commit/a7bcf8c6b))

### Improvements

* update `kubectl` version to `1.29.1` ([#5693](https://github.com/garden-io/garden/issues/5693)) ([d8fc63fad](https://github.com/garden-io/garden/commit/d8fc63fad))
* **core:** include path in template errors ([#5692](https://github.com/garden-io/garden/issues/5692)) ([5dfb0f7cb](https://github.com/garden-io/garden/commit/5dfb0f7cb))
* **ext-tools:** always print versions in `garden tools` output ([#5718](https://github.com/garden-io/garden/issues/5718)) ([e88bb86bc](https://github.com/garden-io/garden/commit/e88bb86bc))
* **helm:** update helm to `3.14.0` ([#5698](https://github.com/garden-io/garden/issues/5698)) ([115d85cae](https://github.com/garden-io/garden/commit/115d85cae))

<a name="0.13.24"></a>
## [0.13.24](https://github.com/garden-io/garden/compare/0.13.23...0.13.24) (2024-01-30)

### Bug Fixes

* copy test artifacts in interactive mode ([#5630](https://github.com/garden-io/garden/issues/5630)) ([e0a3671f5](https://github.com/garden-io/garden/commit/e0a3671f5))
* remove confusing warning message ([#5628](https://github.com/garden-io/garden/issues/5628)) ([68ad7630f](https://github.com/garden-io/garden/commit/68ad7630f))
* **core:** fix "repo" scan mode for remote actions ([#5660](https://github.com/garden-io/garden/issues/5660)) ([d38f1c5fb](https://github.com/garden-io/garden/commit/d38f1c5fb))
* **core:** fix config error when using project.modules ([#5626](https://github.com/garden-io/garden/issues/5626)) ([4d017e4ee](https://github.com/garden-io/garden/commit/4d017e4ee))
* **examples:** ensure Vue web servers start correctly ([#5668](https://github.com/garden-io/garden/issues/5668)) ([1979e0e85](https://github.com/garden-io/garden/commit/1979e0e85))
* **examples:** set correct header for patch resources example ([#5604](https://github.com/garden-io/garden/issues/5604)) ([89d5396a6](https://github.com/garden-io/garden/commit/89d5396a6))
* **k8s:** remove k8s manifest logs on apply ([#5665](https://github.com/garden-io/garden/issues/5665)) ([466ac8c14](https://github.com/garden-io/garden/commit/466ac8c14))
* **module-conversion:** more fixes to PVC type ([#5681](https://github.com/garden-io/garden/issues/5681)) ([96059408c](https://github.com/garden-io/garden/commit/96059408c))
* **module-conversion:** always include build deps ([#5671](https://github.com/garden-io/garden/issues/5671)) ([47c24d54d](https://github.com/garden-io/garden/commit/47c24d54d))
* **template:** do not partially resolve function arg objects with special keys ([#5670](https://github.com/garden-io/garden/issues/5670)) ([5b7aea4d8](https://github.com/garden-io/garden/commit/5b7aea4d8))

<a name="0.13.23"></a>
## [0.13.23](https://github.com/garden-io/garden/compare/0.13.22...0.13.23) (2023-12-22)

### Bug Fixes

* **cli:** fallback to non-highlighted yaml if error occurs ([#5560](https://github.com/garden-io/garden/issues/5560)) ([63eff7db2](https://github.com/garden-io/garden/commit/63eff7db2))
* **core:** inherit Build action mode from dependant Deploy action ([#5589](https://github.com/garden-io/garden/issues/5589)) ([e0505642e](https://github.com/garden-io/garden/commit/e0505642e))
* **git:** fix `exclude` filter in `repo` Git scan mode ([#5526](https://github.com/garden-io/garden/issues/5526)) ([5ef9998a9](https://github.com/garden-io/garden/commit/5ef9998a9))
* **helm:** fix `sha256` hash for `linux-arm64` binary ([#5563](https://github.com/garden-io/garden/issues/5563)) ([ca0d9de97](https://github.com/garden-io/garden/commit/ca0d9de97))
* **jib:** fix OpenJDK `sha256` hashes for `linux-arm64` binaries ([#5566](https://github.com/garden-io/garden/issues/5566)) ([d37e44d73](https://github.com/garden-io/garden/commit/d37e44d73))
* **mavend:** fix Mavend `sha256` hash for `windows-amd64` binary ([#5565](https://github.com/garden-io/garden/issues/5565)) ([85e57e5a4](https://github.com/garden-io/garden/commit/85e57e5a4))
* **publish:** respect the `spec.publishId` in build action config ([#5585](https://github.com/garden-io/garden/issues/5585)) ([f60cde74c](https://github.com/garden-io/garden/commit/f60cde74c))
* **terraform:** fix `sha256` hashes for some old terraform binaries ([#5564](https://github.com/garden-io/garden/issues/5564)) ([f418f65c0](https://github.com/garden-io/garden/commit/f418f65c0))

<a name="0.13.22"></a>
## [0.13.22](https://github.com/garden-io/garden/compare/0.13.21...0.13.22) (2023-12-13)

### Bug Fixes

* if using `tlsCertificates` make the `secretRef` mandatory ([#5533](https://github.com/garden-io/garden/issues/5533)) ([02b809f7c](https://github.com/garden-io/garden/commit/02b809f7c))
* adding an error handler to the segment client ([#5505](https://github.com/garden-io/garden/issues/5505)) ([540498c2f](https://github.com/garden-io/garden/commit/540498c2f))
* **commands:** print section and tags in color ([#5525](https://github.com/garden-io/garden/issues/5525)) ([5e93e0785](https://github.com/garden-io/garden/commit/5e93e0785))
* **commands:** print log command metadata in secondary color ([#5509](https://github.com/garden-io/garden/issues/5509)) ([8141e90cd](https://github.com/garden-io/garden/commit/8141e90cd))
* **core:** avoid unnecessary config version changes ([#5508](https://github.com/garden-io/garden/issues/5508)) ([61eac7601](https://github.com/garden-io/garden/commit/61eac7601))
* **dev:** fix reload error when using templates ([#5329](https://github.com/garden-io/garden/issues/5329)) ([975231032](https://github.com/garden-io/garden/commit/975231032))
* **git:** fix `exclude` files handling in `subtree` Git repo scan mode ([#5504](https://github.com/garden-io/garden/issues/5504)) ([358aeabb9](https://github.com/garden-io/garden/commit/358aeabb9))
* **git:** prefer project-level repo scan mode over env variable ([#5493](https://github.com/garden-io/garden/issues/5493)) ([3c081762b](https://github.com/garden-io/garden/commit/3c081762b))
* **sync-mode:** showing undefined when sync status is not-deployed ([#5522](https://github.com/garden-io/garden/issues/5522)) ([9f967688f](https://github.com/garden-io/garden/commit/9f967688f))

### Improvements

* **cloud:** log 'not logged in' msg at info level for community ([#5553](https://github.com/garden-io/garden/issues/5553)) ([cad50600a](https://github.com/garden-io/garden/commit/cad50600a))
* **dashboard:** better warning logs ([#5538](https://github.com/garden-io/garden/issues/5538)) ([c1d200794](https://github.com/garden-io/garden/commit/c1d200794))
* **ephemeral-kubernetes:** tweak text in error message ([#5535](https://github.com/garden-io/garden/issues/5535)) ([e5a7d2972](https://github.com/garden-io/garden/commit/e5a7d2972))
* **helm:** update helm to `3.12.2` ([#5497](https://github.com/garden-io/garden/issues/5497)) ([56c9b4ff6](https://github.com/garden-io/garden/commit/56c9b4ff6))
* **logger:** update some log lines after style changes ([#5507](https://github.com/garden-io/garden/issues/5507)) ([035bd9e93](https://github.com/garden-io/garden/commit/035bd9e93))

<a name="0.13.21"></a>
## [0.13.21](https://github.com/garden-io/garden/compare/0.13.20...0.13.21) (2023-11-24)

### Bug Fixes

* **exec:** don't split quoted arguments in `exec` plugin's command (#5470) ([34b07feb3](https://github.com/garden-io/garden/commit/34b07feb3))
* **core:** log exec provider resolution at info level ([#5469](https://github.com/garden-io/garden/issues/5469)) ([539abf905](https://github.com/garden-io/garden/commit/539abf905))
* **git:** fix confusing error messages on exit code 128 ([#5439](https://github.com/garden-io/garden/issues/5439)) ([2779705b6](https://github.com/garden-io/garden/commit/2779705b6))
* **k8s:** fix paths in requests to kubernetes api ([#5476](https://github.com/garden-io/garden/issues/5476)) ([783cc66a9](https://github.com/garden-io/garden/commit/783cc66a9))
* **k8s:** read tls-server-name correctly from kubeconfig ([#5466](https://github.com/garden-io/garden/issues/5466)) ([554d964ff](https://github.com/garden-io/garden/commit/554d964ff))

### Features

* respect `NO_COLOR` env var ([#5451](https://github.com/garden-io/garden/issues/5451)) ([889552f87](https://github.com/garden-io/garden/commit/889552f87))

### Improvements

* **core:** better action lifecycle logs ([#5428](https://github.com/garden-io/garden/issues/5428)) ([65653b92e](https://github.com/garden-io/garden/commit/65653b92e))
* **logger:** some minor fixes ([#5475](https://github.com/garden-io/garden/issues/5475)) ([b1288039f](https://github.com/garden-io/garden/commit/b1288039f))
* **logger:** use 'white' as primary color ([#5465](https://github.com/garden-io/garden/issues/5465)) ([b8e232cd9](https://github.com/garden-io/garden/commit/b8e232cd9))
* **logger:** better provider resolution lifecycle logs ([#5464](https://github.com/garden-io/garden/issues/5464)) ([7d5557fc3](https://github.com/garden-io/garden/commit/7d5557fc3))
* **logger:** various tweaks to log lines ([#5452](https://github.com/garden-io/garden/issues/5452)) ([11f76148b](https://github.com/garden-io/garden/commit/11f76148b))

<a name="0.13.20"></a>
## [0.13.20](https://github.com/garden-io/garden/compare/0.13.19...0.13.20) (2023-11-16)

### Bug Fixes

* fix Windows file tree ([#5364](https://github.com/garden-io/garden/issues/5364)) ([c5c3c66f4](https://github.com/garden-io/garden/commit/c5c3c66f4))
* always resolve symlinks for the executable path in the self-updater ([#5352](https://github.com/garden-io/garden/issues/5352)) ([7ee19dd72](https://github.com/garden-io/garden/commit/7ee19dd72))
* **examples:** fix typo in k8s example + fix comment ([#5337](https://github.com/garden-io/garden/issues/5337)) ([098d59ea4](https://github.com/garden-io/garden/commit/098d59ea4))
* **garden-sea:** resolve symlinks for GARDEN_SEA_EXECUTABLE_PATH ([#5353](https://github.com/garden-io/garden/issues/5353)) ([aba79f50d](https://github.com/garden-io/garden/commit/aba79f50d))
* **sync-mode:** avoid collisions in sync key prefixes ([#5409](https://github.com/garden-io/garden/issues/5409)) ([9edc9ac78](https://github.com/garden-io/garden/commit/9edc9ac78))
* **sync-mode:** use the same source path schemas for all action types ([#5363](https://github.com/garden-io/garden/issues/5363)) ([71b3781cb](https://github.com/garden-io/garden/commit/71b3781cb))

### Features

* change default git scan mode to `repo` ([#5399](https://github.com/garden-io/garden/issues/5399)) ([da3f68fcb](https://github.com/garden-io/garden/commit/da3f68fcb))
* **k8s:** add service account and IRSA support for in-cluster-builder ([#3384](https://github.com/garden-io/garden/issues/3384)) ([9f6b137d6](https://github.com/garden-io/garden/commit/9f6b137d6))

### Improvements

* **core:** log aborted nodes on dep error ([#5360](https://github.com/garden-io/garden/issues/5360)) ([ce1995bc8](https://github.com/garden-io/garden/commit/ce1995bc8))
* **git:** don't require Garden `static` dir to be a Git repo ([#5120](https://github.com/garden-io/garden/issues/5120)) ([dc8ba20ac](https://github.com/garden-io/garden/commit/dc8ba20ac))
* **k8s:** remove old system garden and improve local-k8s startup time ([#5136](https://github.com/garden-io/garden/issues/5136)) ([875cacb1f](https://github.com/garden-io/garden/commit/875cacb1f))
* **sync:** always use short hash-based tmp dirs paths ([#5413](https://github.com/garden-io/garden/issues/5413)) ([453ed6a30](https://github.com/garden-io/garden/commit/453ed6a30))

### Performance Improvements

* do not compute log message until required ([#5410](https://github.com/garden-io/garden/issues/5410)) ([14e713bff](https://github.com/garden-io/garden/commit/14e713bff))

<a name="0.13.19"></a>
## [0.13.19](https://github.com/garden-io/garden/compare/0.13.18...0.13.19) (2023-11-04)

### Bug Fixes

* handle and retry DNS errors ([#5326](https://github.com/garden-io/garden/issues/5326)) ([e1738ac51](https://github.com/garden-io/garden/commit/e1738ac51))
* change contributing redirect ([#5280](https://github.com/garden-io/garden/issues/5280)) ([49f3e7520](https://github.com/garden-io/garden/commit/49f3e7520))
* **api:** visible and better error when fetching secrets 404s ([#5277](https://github.com/garden-io/garden/issues/5277)) ([32fc4b5a8](https://github.com/garden-io/garden/commit/32fc4b5a8))
* **cloud:** do not fetch secrets on community tier ([#5291](https://github.com/garden-io/garden/issues/5291)) ([5eae8baf1](https://github.com/garden-io/garden/commit/5eae8baf1))
* **cloud:** ensure cloud project id is set on garden class ([#5306](https://github.com/garden-io/garden/issues/5306)) ([66a341e2f](https://github.com/garden-io/garden/commit/66a341e2f))
* **core:** correctly apply source.path in VCS logic ([#5305](https://github.com/garden-io/garden/issues/5305)) ([aaaf6d5f4](https://github.com/garden-io/garden/commit/aaaf6d5f4))
* **core:** resolve templates in `source.path` ([#5345](https://github.com/garden-io/garden/issues/5345)) ([1efbab58f](https://github.com/garden-io/garden/commit/1efbab58f))
* **core:** print success message with cyan color ([#5279](https://github.com/garden-io/garden/issues/5279)) ([acefb96a4](https://github.com/garden-io/garden/commit/acefb96a4))
* **core:** print warning message if docker server version is unparsable (garden-io[#5284](https://github.com/garden-io/garden/issues/5284)) ([#5288](https://github.com/garden-io/garden/issues/5288)) ([5f92abd07](https://github.com/garden-io/garden/commit/5f92abd07))
* **dev:** fix crash on very narrow terminals ([#5327](https://github.com/garden-io/garden/issues/5327)) ([4af4d6c6a](https://github.com/garden-io/garden/commit/4af4d6c6a))
* **examples:** use yaml 1.1 octal numbers in kubernetes manifest files ([#5273](https://github.com/garden-io/garden/issues/5273)) ([450099a22](https://github.com/garden-io/garden/commit/450099a22))
* **helm:** handle missing (null) values in version check ([#5307](https://github.com/garden-io/garden/issues/5307)) ([31f442029](https://github.com/garden-io/garden/commit/31f442029))
* **k8s:** return deployed mode in container Deploy status ([#5302](https://github.com/garden-io/garden/issues/5302)) ([6c18b6d3f](https://github.com/garden-io/garden/commit/6c18b6d3f))
* **k8s:** correct `0.12 => 0.13` service resource conversion ([#5272](https://github.com/garden-io/garden/issues/5272)) ([bfdd0af35](https://github.com/garden-io/garden/commit/bfdd0af35))
* **k8s:** ensure patchResources can patch namespace ([#5334](https://github.com/garden-io/garden/issues/5334)) ([71d45a9c1](https://github.com/garden-io/garden/commit/71d45a9c1))
* **logger:** log exec build/deploy actions at info level ([#5292](https://github.com/garden-io/garden/issues/5292)) ([522e30578](https://github.com/garden-io/garden/commit/522e30578))
* **pulumi:** fix process dependency resolution in plugin command ([#5325](https://github.com/garden-io/garden/issues/5325)) ([d460f3f0f](https://github.com/garden-io/garden/commit/d460f3f0f))
* **pulumi:** propagate resolved action context to pulumi plugin commands ([#5324](https://github.com/garden-io/garden/issues/5324)) ([750e88dfe](https://github.com/garden-io/garden/commit/750e88dfe))

### Improvements

* **jib:** support JDK 21 LTS version ([#5341](https://github.com/garden-io/garden/issues/5341)) ([a54b747a7](https://github.com/garden-io/garden/commit/a54b747a7))
* **logs:** add 'rawMsg' field to logEntry ([#5282](https://github.com/garden-io/garden/issues/5282)) ([242a9c4b4](https://github.com/garden-io/garden/commit/242a9c4b4))

<a name="0.13.18"></a>
## [0.13.18](https://github.com/garden-io/garden/compare/0.13.17...0.13.18) (2023-10-17)

### Bug Fixes

* allow generated files in build actions ([#5230](https://github.com/garden-io/garden/issues/5230)) ([1a55cf7c2](https://github.com/garden-io/garden/commit/1a55cf7c2))
* prevent crash due to unresolved alias in yaml ([#5215](https://github.com/garden-io/garden/issues/5215)) ([1ceb355d7](https://github.com/garden-io/garden/commit/1ceb355d7))
* allow listing disabled actions in get actions cmd ([#5203](https://github.com/garden-io/garden/issues/5203)) ([eb316b1af](https://github.com/garden-io/garden/commit/eb316b1af))
* **build:** make `copyFrom.targetPath` default to `copyFrom.sourcePath` ([#5234](https://github.com/garden-io/garden/issues/5234)) ([62567d720](https://github.com/garden-io/garden/commit/62567d720))
* **cli:** exit code 1 on unknown commands, sub-commands and flags ([#5235](https://github.com/garden-io/garden/issues/5235)) ([66007f28a](https://github.com/garden-io/garden/commit/66007f28a))
* **core:** ensure needsReload flag works ([#5211](https://github.com/garden-io/garden/issues/5211)) ([cdf65e3b6](https://github.com/garden-io/garden/commit/cdf65e3b6))
* **serve:** connect to Cloud if process is started outside of project dir ([#4822](https://github.com/garden-io/garden/issues/4822)) ([61b424e5c](https://github.com/garden-io/garden/commit/61b424e5c))

### Features

* **k8s:** add support for patching manifests ([#5187](https://github.com/garden-io/garden/issues/5187)) ([5f7f5336a](https://github.com/garden-io/garden/commit/5f7f5336a))

### Improvements

* using a new release endpoint for self-update ([#5229](https://github.com/garden-io/garden/issues/5229)) ([33cfebc34](https://github.com/garden-io/garden/commit/33cfebc34))
* **core:** log stderr from exec as info ([#5227](https://github.com/garden-io/garden/issues/5227)) ([c6016f420](https://github.com/garden-io/garden/commit/c6016f420))

<a name="0.13.17"></a>
## [0.13.17](https://github.com/garden-io/garden/compare/0.13.16...0.13.17) (2023-10-05)

### Bug Fixes

* **helm:** use build path for charts for helm modules converted to ac… ([#5190](https://github.com/garden-io/garden/issues/5190)) ([eb5e859fc](https://github.com/garden-io/garden/commit/eb5e859fc))
* **k8s:** use yaml 1.1 when reading kubernetes manifests ([#5184](https://github.com/garden-io/garden/issues/5184)) ([8490aacf9](https://github.com/garden-io/garden/commit/8490aacf9))
* **pulumi:** return correct responses for pulumi plugin commands ([#5129](https://github.com/garden-io/garden/issues/5129)) ([da981def5](https://github.com/garden-io/garden/commit/da981def5))
* **server:** ensure using a free port for dev console ([#5163](https://github.com/garden-io/garden/issues/5163)) ([3a17402f1](https://github.com/garden-io/garden/commit/3a17402f1))

<a name="0.13.16"></a>
## [0.13.16](https://github.com/garden-io/garden/compare/0.13.15...0.13.16) (2023-09-28)

### Bug Fixes

* testing to include fsevents in core instead of cli ([#5154](https://github.com/garden-io/garden/issues/5154)) ([e7d3ebac6](https://github.com/garden-io/garden/commit/e7d3ebac6))

<a name="0.13.15"></a>
## [0.13.15](https://github.com/garden-io/garden/compare/0.13.14...0.13.15) (2023-09-27)

### Bug Fixes

* otel collector enabled detection ([#5141](https://github.com/garden-io/garden/issues/5141)) ([4b05677f7](https://github.com/garden-io/garden/commit/4b05677f7))
* memoize memory leak ([#5137](https://github.com/garden-io/garden/issues/5137)) ([106eb72ba](https://github.com/garden-io/garden/commit/106eb72ba))
* add fsevents as a dependency ([#5133](https://github.com/garden-io/garden/issues/5133)) ([76e186fe5](https://github.com/garden-io/garden/commit/76e186fe5))
* remove read lock from config get ([#5114](https://github.com/garden-io/garden/issues/5114)) ([2967dc5b6](https://github.com/garden-io/garden/commit/2967dc5b6))
* **k8s:** handle AEC-paused resources properly ([#5122](https://github.com/garden-io/garden/issues/5122)) ([ed87cfdac](https://github.com/garden-io/garden/commit/ed87cfdac))
* **k8s:** correctly resolve manifests when `build` is set ([#4846](https://github.com/garden-io/garden/issues/4846)) ([6c737a905](https://github.com/garden-io/garden/commit/6c737a905))
* **module:** only merge relevant variables overrides in config ([#5138](https://github.com/garden-io/garden/issues/5138)) ([b0d7a4756](https://github.com/garden-io/garden/commit/b0d7a4756))
* **remote-building:** use "Recreate" strategy garden-util (kaniko) and garden-buildkit deployments ([#5125](https://github.com/garden-io/garden/issues/5125)) ([541851b8c](https://github.com/garden-io/garden/commit/541851b8c))

### Features

* **cli:** add cloud secrets update command ([#4804](https://github.com/garden-io/garden/issues/4804)) ([8b8fc0060](https://github.com/garden-io/garden/commit/8b8fc0060))
* **config:** better error messages around schema validation ([#4889](https://github.com/garden-io/garden/issues/4889)) ([a098a1497](https://github.com/garden-io/garden/commit/a098a1497))

### Improvements

* **build:** update moby/buildkit to v0.12.2 ([#5105](https://github.com/garden-io/garden/issues/5105)) ([5faac9ecc](https://github.com/garden-io/garden/commit/5faac9ecc))

<a name="0.13.14"></a>
## [0.13.14](https://github.com/garden-io/garden/compare/0.13.13...0.13.14) (2023-09-19)

### Bug Fixes

* remove rsync dependency from homebrew formula ([#5086](https://github.com/garden-io/garden/issues/5086)) ([640b51a14](https://github.com/garden-io/garden/commit/640b51a14))
* print the output of Run and Test actions on the info log level ([#5059](https://github.com/garden-io/garden/issues/5059)) ([30e6fa008](https://github.com/garden-io/garden/commit/30e6fa008))
* avoid crash during kubectl retry ([#5098](https://github.com/garden-io/garden/issues/5098)) ([c5a7679cb](https://github.com/garden-io/garden/commit/c5a7679cb))
* use shell matching platform when running scripts ([#5034](https://github.com/garden-io/garden/issues/5034)) ([22013ae77](https://github.com/garden-io/garden/commit/22013ae77))
* do not error if actionSources are empty ([#5036](https://github.com/garden-io/garden/issues/5036)) ([bc38c9747](https://github.com/garden-io/garden/commit/bc38c9747))
* **framework:** several error handling improvements ([#5001](https://github.com/garden-io/garden/issues/5001)) ([1bfe7b5ad](https://github.com/garden-io/garden/commit/1bfe7b5ad))

### Features

* add ephemeral kubernetes provider ([#4927](https://github.com/garden-io/garden/issues/4927)) ([ed0ab0198](https://github.com/garden-io/garden/commit/ed0ab0198))

### Improvements

* **plugins:** debug log manifest dump ([#4997](https://github.com/garden-io/garden/issues/4997)) ([3a568369b](https://github.com/garden-io/garden/commit/3a568369b))

<a name="0.13.13"></a>
## [0.13.13](https://github.com/garden-io/garden/compare/0.13.12...0.13.13) (2023-08-31)

### Features
* Add support for k3s family clusters like k3s, rancher-desktop and k3ds ([#4977](https://github.com/garden-io/garden/commit/9551684e13de6e5884e605e3e9c9fc2a17e2d0e3))

### Improvements

* more useful "create project" yaml ([#4985](https://github.com/garden-io/garden/issues/4985)) ([012d4ea77](https://github.com/garden-io/garden/commit/012d4ea77))
* always offer -f as alias with --force ([#4986](https://github.com/garden-io/garden/issues/4986)) ([7e2c9d1bf](https://github.com/garden-io/garden/commit/7e2c9d1bf))
* **server:** output more debug info ([#4613](https://github.com/garden-io/garden/issues/4613)) ([0222bcbe9](https://github.com/garden-io/garden/commit/0222bcbe9))

### Performance Improvements

* various performance improvements ([#4959](https://github.com/garden-io/garden/issues/4959)) ([a2c5f6e2f](https://github.com/garden-io/garden/commit/a2c5f6e2f))

### Bug Fixes

* ensure using next free port for dev console ([#4984](https://github.com/garden-io/garden/issues/4984)) ([738828e66](https://github.com/garden-io/garden/commit/738828e66))
* avoid action execution for the static outputs references of implicit dependencies. ([#4975](https://github.com/garden-io/garden/issues/4975)) ([da589ebcf](https://github.com/garden-io/garden/commit/da589ebcf))
* properly escape the newline for the tag argument ([#4974](https://github.com/garden-io/garden/issues/4974)) ([4c69801fb](https://github.com/garden-io/garden/commit/4c69801fb))
* checkout repo before prerelease ([45d023653](https://github.com/garden-io/garden/commit/45d023653))
* correct otel collector binary definition for arm64 linux ([7f6707174](https://github.com/garden-io/garden/commit/7f6707174))
* ensure that the `edge-bonsai` tag is updated on a prerelease ([a1378b166](https://github.com/garden-io/garden/commit/a1378b166))
* detect overlapping `targetPath` in `generateFiles` ([#4961](https://github.com/garden-io/garden/issues/4961)) ([430b8aeda](https://github.com/garden-io/garden/commit/430b8aeda))
* **circleci:** use latest gh cli utility ([#4971](https://github.com/garden-io/garden/issues/4971)) ([e9dfe3341](https://github.com/garden-io/garden/commit/e9dfe3341))
* **core:** input validation for module templates ([#4995](https://github.com/garden-io/garden/issues/4995)) ([bb77681ed](https://github.com/garden-io/garden/commit/bb77681ed))
* **docs:** fix 'undefined' string in ToC ([#4987](https://github.com/garden-io/garden/issues/4987)) ([3af6af60e](https://github.com/garden-io/garden/commit/3af6af60e))
* **jib:** make native arm maven usable on ARM macs ([#4968](https://github.com/garden-io/garden/issues/4968)) ([491fe88e8](https://github.com/garden-io/garden/commit/491fe88e8))
* **k8s:** detect duplicate manifest declarations ([#4993](https://github.com/garden-io/garden/issues/4993)) ([eca466b88](https://github.com/garden-io/garden/commit/eca466b88))

<a name="0.13.12"></a>
## [0.13.12](https://github.com/garden-io/garden/compare/0.13.11...0.13.12) (2023-08-16)

### Bug Fixes

* detect rosetta emulation during self-update ([#4951](https://github.com/garden-io/garden/issues/4951)) ([56722b2b6](https://github.com/garden-io/garden/commit/56722b2b6))
* **local-mode:** fix port forward when having many local ssh keys ([3bbc44dd7](https://github.com/garden-io/garden/commit/3bbc44dd7))

### Features

* allow arm installs for self-update to bonsai-edge ([71f6221d5](https://github.com/garden-io/garden/commit/71f6221d5))
* add ARM64 support ([#4947](https://github.com/garden-io/garden/issues/4947)) ([cb0ef7de4](https://github.com/garden-io/garden/commit/cb0ef7de4))

### Improvements

* **dev:** show spinner when cmd is running ([#4945](https://github.com/garden-io/garden/issues/4945)) ([997c2b313](https://github.com/garden-io/garden/commit/997c2b313))

<a name="0.13.11"></a>
## [0.13.11](https://github.com/garden-io/garden/compare/0.13.10...0.13.11) (2023-08-14)

### Bug Fixes

* repo scan performance and memory leak ([#4936](https://github.com/garden-io/garden/issues/4936)) ([65d3e7589](https://github.com/garden-io/garden/commit/65d3e7589))
* templated module templating ([#4932](https://github.com/garden-io/garden/issues/4932)) ([831f61800](https://github.com/garden-io/garden/commit/831f61800))
* only allow a valid environment to be set as default env ([a2b20e84b](https://github.com/garden-io/garden/commit/a2b20e84b))
* **k8s:** delete pvc on namespace cleanup ([#4933](https://github.com/garden-io/garden/issues/4933)) ([f866c9537](https://github.com/garden-io/garden/commit/f866c9537))

### Performance Improvements

* improve garden performance ([#4938](https://github.com/garden-io/garden/issues/4938)) ([bf00e650f](https://github.com/garden-io/garden/commit/bf00e650f))

<a name="0.13.10"></a>
## [0.13.10](https://github.com/garden-io/garden/compare/0.13.9...0.13.10) (2023-08-03)

### Bug Fixes

* mutagen default permissions are too restrictive ([#4824](https://github.com/garden-io/garden/issues/4824)) ([0d6c93d49](https://github.com/garden-io/garden/commit/0d6c93d49))
* restore azure devops support for dockerhub images ([#4829](https://github.com/garden-io/garden/issues/4829)) ([ef42b168a](https://github.com/garden-io/garden/commit/ef42b168a))
* **config:** throw error if multiple project configs are found ([86bb66f39](https://github.com/garden-io/garden/commit/86bb66f39))
* **docs:** update migration guide ([d685ab96f](https://github.com/garden-io/garden/commit/d685ab96f))
* **k8s:** regression in globs in k8s manifest files ([#4903](https://github.com/garden-io/garden/issues/4903)) ([1b511dc64](https://github.com/garden-io/garden/commit/1b511dc64))
* **k8s:** allow null in spec.files for deploy config ([#4881](https://github.com/garden-io/garden/issues/4881)) ([4fc3a0997](https://github.com/garden-io/garden/commit/4fc3a0997))
* **template:** inputs processing in module config resolution ([#4907](https://github.com/garden-io/garden/issues/4907)) ([d4e7dcbb0](https://github.com/garden-io/garden/commit/d4e7dcbb0))
* **template:** respect project level variables in action config context ([#4883](https://github.com/garden-io/garden/issues/4883)) ([05d0f4455](https://github.com/garden-io/garden/commit/05d0f4455))

### Improvements

* **k8s:** less verbose Run/Test errors ([#4894](https://github.com/garden-io/garden/issues/4894)) ([ea40c016b](https://github.com/garden-io/garden/commit/ea40c016b))

<a name="0.13.9"></a>
## [0.13.9](https://github.com/garden-io/garden/compare/0.13.8...0.13.9) (2023-07-20)

### Bug Fixes

* properly handle build deps for pulumi and terraform modules ([fbc2320af](https://github.com/garden-io/garden/commit/fbc2320af))
* enoent when version set to null on tf and pulumi ([8de4c6f12](https://github.com/garden-io/garden/commit/8de4c6f12))
* allow to use `parent.name` template ([c01f4a052](https://github.com/garden-io/garden/commit/c01f4a052))
* local-docker build failure when `deploymentRegistry` is enabled ([#4835](https://github.com/garden-io/garden/issues/4835)) ([135ea0413](https://github.com/garden-io/garden/commit/135ea0413))
* **container:** add default container annotation to generated manifests ([7ca6ca5d1](https://github.com/garden-io/garden/commit/7ca6ca5d1))
* **docs:** remove unimplemented change from Bonsai migration guide ([b8483e3b1](https://github.com/garden-io/garden/commit/b8483e3b1))
* **k8s:** enable microk8s addons sequentially ([1a715f949](https://github.com/garden-io/garden/commit/1a715f949))
* **mutagen:** use shorter directories for mutagen syncs ([#4867](https://github.com/garden-io/garden/issues/4867)) ([2698410c8](https://github.com/garden-io/garden/commit/2698410c8))

### Features

* otel collector integration ([#4769](https://github.com/garden-io/garden/issues/4769)) ([9c4405548](https://github.com/garden-io/garden/commit/9c4405548))
* **exec:** add --target flag in exec command ([ac7042759](https://github.com/garden-io/garden/commit/ac7042759))

### Improvements

* update docker to v24.0.4 ([eb12ceab0](https://github.com/garden-io/garden/commit/eb12ceab0))
* verify downloads using sha256 in Dockerfiles ([#4826](https://github.com/garden-io/garden/issues/4826)) ([e976849c7](https://github.com/garden-io/garden/commit/e976849c7))

### Performance Improvements

* **git:** optimize git scan when exclude but no include filter is set ([7361fc90a](https://github.com/garden-io/garden/commit/7361fc90a))

<a name="0.13.8"></a>
## [0.13.8](https://github.com/garden-io/garden/compare/0.13.7...0.13.8) (2023-07-13)

### Bug Fixes

* respect spec.publishId for publishing image ([24089334b](https://github.com/garden-io/garden/commit/24089334b))
* **cloud:** send "sessionFailed" event if result has errors ([e4c5c936c](https://github.com/garden-io/garden/commit/e4c5c936c))
* **template:** allow empty string as a valid arg of `isEmpty` helper ([45d9484cd](https://github.com/garden-io/garden/commit/45d9484cd))
* **template:** allow `null` as a valid argument in helper functions ([655a5c8e4](https://github.com/garden-io/garden/commit/655a5c8e4))

### Features

* add `with-dependants` deploy command flag ([c34851e9b](https://github.com/garden-io/garden/commit/c34851e9b))
* **config:** allow multiple actions with same key if all but one is disabled ([d7ea44955](https://github.com/garden-io/garden/commit/d7ea44955))
* **k8s:** support globs in kubernetes module/Deploy files field ([9cb5ba402](https://github.com/garden-io/garden/commit/9cb5ba402))
* **server:** add internal _shell command and new WS endpoint ([873d4aa22](https://github.com/garden-io/garden/commit/873d4aa22))

### Improvements

* **server:** also send sessions events over ws ([55fdeee98](https://github.com/garden-io/garden/commit/55fdeee98))

<a name="0.13.7"></a>
## [0.13.7](https://github.com/garden-io/garden/compare/0.13.6...0.13.7) (2023-07-10)

### Bug Fixes

* override action variables via --var cli flag ([6b0b9a637](https://github.com/garden-io/garden/commit/6b0b9a637))
* task description conversion ([495507344](https://github.com/garden-io/garden/commit/495507344))
* **cli:** override nested variables using dot notation ([c904730ed](https://github.com/garden-io/garden/commit/c904730ed))
* **exec:** show error on failed commands ([8d39e22a7](https://github.com/garden-io/garden/commit/8d39e22a7))
* **k8s:** correctly resolve manifests when `build` is set ([a5f509295](https://github.com/garden-io/garden/commit/a5f509295))

### Features

* **cloud:** display short url for command result ([c16bff6c9](https://github.com/garden-io/garden/commit/c16bff6c9))
* **k8s:** support globs in kubernetes module/Deploy files field ([c9efb473d](https://github.com/garden-io/garden/commit/c9efb473d))
* **openshift:** enable deploy --sync ([#4751](https://github.com/garden-io/garden/issues/4751)) ([5281d75b6](https://github.com/garden-io/garden/commit/5281d75b6))
* **vcs:** add new git repo scanning method to improve resolution speed ([6cb96a618](https://github.com/garden-io/garden/commit/6cb96a618))

### Improvements

* allow to deploy all actions with --skip-dependencies ([f3bc22cc6](https://github.com/garden-io/garden/commit/f3bc22cc6))
* **k8s:** retry the most used `kubectl` commands on failures ([07224f03e](https://github.com/garden-io/garden/commit/07224f03e))

### Performance Improvements

* automatically include `[]` if all files are excluded ([29621b9dd](https://github.com/garden-io/garden/commit/29621b9dd))
* **git:** avoid stat-ing files when unnecessary ([2d717ecd9](https://github.com/garden-io/garden/commit/2d717ecd9))

<a name="0.13.6"></a>
## [0.13.6](https://github.com/garden-io/garden/compare/0.13.5...0.13.6) (2023-07-04)

### Bug Fixes

* respect deploymentRegistry in the garden publish command ([#4740](https://github.com/garden-io/garden/issues/4740)) ([aa7708ced](https://github.com/garden-io/garden/commit/aa7708ced))
* **helm:** expose ingresses of resources deployed with helm ([339fe863e](https://github.com/garden-io/garden/commit/339fe863e))
* **template:** don't use var file when path is unresolved ([#4737](https://github.com/garden-io/garden/issues/4737)) ([c323ccc92](https://github.com/garden-io/garden/commit/c323ccc92))

### Features

* open telemetry ([#4664](https://github.com/garden-io/garden/issues/4664)) ([10aee8b1b](https://github.com/garden-io/garden/commit/10aee8b1b))
* **k8s:** introduce new flag waitForJobs to wait for k8s jobs ([#4611](https://github.com/garden-io/garden/issues/4611)) ([6eae3a652](https://github.com/garden-io/garden/commit/6eae3a652))
* **openshift:** Run and Test actions ([#4730](https://github.com/garden-io/garden/issues/4730)) ([46ec532b4](https://github.com/garden-io/garden/commit/46ec532b4))
* **openshift:** container Build action ([#4726](https://github.com/garden-io/garden/issues/4726)) ([bdf9e0fbc](https://github.com/garden-io/garden/commit/bdf9e0fbc))

### Improvements

* **k8s:** retry on config retrieval failure ([78669da98](https://github.com/garden-io/garden/commit/78669da98))
* **server:** add some useful fields to ws event payload ([#4727](https://github.com/garden-io/garden/issues/4727)) ([3c2022c90](https://github.com/garden-io/garden/commit/3c2022c90))

<a name="0.13.5"></a>
## [0.13.5](https://github.com/garden-io/garden/compare/0.13.4...0.13.5) (2023-06-27)

### Bug Fixes

* **k8s:** fix regression in  sync stop logic ([e3349428d](https://github.com/garden-io/garden/commit/e3349428d))
* **telemetry:** do not throw in case of any runtime error ([#4722](https://github.com/garden-io/garden/issues/4722)) ([485d25458](https://github.com/garden-io/garden/commit/485d25458))

<a name="0.13.4"></a>
## [0.13.4](https://github.com/garden-io/garden/compare/0.13.3...0.13.4) (2023-06-27)

### Bug Fixes

* update version hash if a file is renamed ([12bc08b84](https://github.com/garden-io/garden/commit/12bc08b84))
* **cli:** print correct link to web dashboard ([#4685](https://github.com/garden-io/garden/issues/4685)) ([6d57b1f5c](https://github.com/garden-io/garden/commit/6d57b1f5c))
* **cloud:** emit stable action uids across phases ([195a65123](https://github.com/garden-io/garden/commit/195a65123))
* **cloud:** fix session registration flow for dev ([5f782884e](https://github.com/garden-io/garden/commit/5f782884e))
* **core:** tweak output from internal _get-service-status command ([09228b819](https://github.com/garden-io/garden/commit/09228b819))
* **dev:** running command status message could become inconsistent ([0cd29f9a4](https://github.com/garden-io/garden/commit/0cd29f9a4))
* **jib:** fix sha256 hashes for `mvnd` binaries ([0ea5f7857](https://github.com/garden-io/garden/commit/0ea5f7857))
* **k8s:** update default Kaniko version ([6584369d4](https://github.com/garden-io/garden/commit/6584369d4))
* **k8s:** invalid session name error with e.g. underscore in username/path ([62e8a96ad](https://github.com/garden-io/garden/commit/62e8a96ad))
* **template-strings:** do not apply helper functions on unresolved string ([#4692](https://github.com/garden-io/garden/issues/4692)) ([0b47cccc6](https://github.com/garden-io/garden/commit/0b47cccc6))

### Improvements

* **jib:** allow concurrent maven builds ([c9a6cf820](https://github.com/garden-io/garden/commit/c9a6cf820))
* **jib:** support custom `mvnd` binaries ([d2d6f4df2](https://github.com/garden-io/garden/commit/d2d6f4df2))
* **logs:** log resolve and statusOnly tasks at debug level ([#4691](https://github.com/garden-io/garden/issues/4691)) ([90577faad](https://github.com/garden-io/garden/commit/90577faad))
* **sdk:** more iteration on the plugin SDK + migrate exec plugin ([#4654](https://github.com/garden-io/garden/issues/4654)) ([ac4cd75ca](https://github.com/garden-io/garden/commit/ac4cd75ca))
* **server:** add more command info to ws responses ([4b01824bf](https://github.com/garden-io/garden/commit/4b01824bf))
* **server:** better logging for loading config ([#4688](https://github.com/garden-io/garden/issues/4688)) ([c4f665917](https://github.com/garden-io/garden/commit/c4f665917))

<a name="0.13.3"></a>
## [0.13.3](https://github.com/garden-io/garden/compare/0.13.2...0.13.3) (2023-06-21)

### Bug Fixes

* microk8s log following race condition ([5cf7f56e8](https://github.com/garden-io/garden/commit/5cf7f56e8))
* custom commands not available at beginning in the dev mode ([3dda63e6a](https://github.com/garden-io/garden/commit/3dda63e6a))
* dev command not working with some plugins ([364aa4812](https://github.com/garden-io/garden/commit/364aa4812))
* show deploy names instead of [object Object] in logs cmd error ([8d8351aa5](https://github.com/garden-io/garden/commit/8d8351aa5))
* wrong helm release names on runs and tests with modules ([ed9e7b956](https://github.com/garden-io/garden/commit/ed9e7b956))
* do not mark deploy action outdated for irrelevant file changes ([149bfdf18](https://github.com/garden-io/garden/commit/149bfdf18))
* print garden version in verbose logging ([ed4147105](https://github.com/garden-io/garden/commit/ed4147105))
* properly pass module buidld dependencies ([cf751991e](https://github.com/garden-io/garden/commit/cf751991e))
* properly convert serviceResources ([0f427fd29](https://github.com/garden-io/garden/commit/0f427fd29))
* infinite retry loop on pod creation error ([8af4a844f](https://github.com/garden-io/garden/commit/8af4a844f))
* **analytics:** do not track hidden commands ([b005da99b](https://github.com/garden-io/garden/commit/b005da99b))
* **cli:** ignore deprecated --skip-watch flag in deploy command ([841ea3ff9](https://github.com/garden-io/garden/commit/841ea3ff9))
* **cloud:** emit ns statuses for in-cluster builds ([#4628](https://github.com/garden-io/garden/issues/4628)) ([fec4668c0](https://github.com/garden-io/garden/commit/fec4668c0))
* **cloud:** properly handle dev delegation ([#4675](https://github.com/garden-io/garden/issues/4675)) ([4cdad7f50](https://github.com/garden-io/garden/commit/4cdad7f50))
* **dev:** don't init cloud API on no-project commands ([aff49fd5e](https://github.com/garden-io/garden/commit/aff49fd5e))
* **garden:** ensure namespace is resolved when getting instance key ([2d0f4e518](https://github.com/garden-io/garden/commit/2d0f4e518))
* **pulumi:** remove PULUMI_EXPERIMENTAL flag due to side effects ([#4585](https://github.com/garden-io/garden/issues/4585)) ([d9cec2dba](https://github.com/garden-io/garden/commit/d9cec2dba))
* **server:** ensure logs are displayed in dev command ([25dcdb8bf](https://github.com/garden-io/garden/commit/25dcdb8bf))
* **server:** set correct default project root for autocomplete requests ([97e4d33e6](https://github.com/garden-io/garden/commit/97e4d33e6))
* **sync:** fix status bug for `kubernetes` deploys ([564995a59](https://github.com/garden-io/garden/commit/564995a59))
* **sync:** fix log rendering for sync status cmd ([be933cd7a](https://github.com/garden-io/garden/commit/be933cd7a))

### Features

* **cli:** add `get files` command to see files included in actions ([ee63d5fe5](https://github.com/garden-io/garden/commit/ee63d5fe5))
* **template:** allow variable references in include/exclude config ([3773e2ed3](https://github.com/garden-io/garden/commit/3773e2ed3))
* **template:** allow `this.name` and `this.mode` in action config ([#4646](https://github.com/garden-io/garden/issues/4646)) ([f3bf29ef5](https://github.com/garden-io/garden/commit/f3bf29ef5))

### Improvements

* support version command in dev mode ([90f16eca7](https://github.com/garden-io/garden/commit/90f16eca7))
* **events:** improve types/consistency for action status events ([aee98c6a3](https://github.com/garden-io/garden/commit/aee98c6a3))
* **jib:** upgrade Maven Daemon version to `0.9.0` ([0e822b392](https://github.com/garden-io/garden/commit/0e822b392))
* **jib:** upgrade Maven version to `3.8.8` ([a6310eba1](https://github.com/garden-io/garden/commit/a6310eba1))
* **k8s:** catch k3s connectivity error and retry ([8c999995f](https://github.com/garden-io/garden/commit/8c999995f))

<a name="0.13.2"></a>
## [0.13.2](https://github.com/garden-io/garden/compare/0.13.1...0.13.2) (2023-06-08)

### Bug Fixes

* show short url for cloud ([c76dfd103](https://github.com/garden-io/garden/commit/c76dfd103))
* ensure build context on ´ready´ status builds ([3b7ee5330](https://github.com/garden-io/garden/commit/3b7ee5330))
* **k8s:** handle intermittent socket hang up errors ([634424766](https://github.com/garden-io/garden/commit/634424766))
* **self-update:** fix target release finding machinery ([81945b3d4](https://github.com/garden-io/garden/commit/81945b3d4))
* **self-update:** fix list of the latest available versions ([5a7f465e6](https://github.com/garden-io/garden/commit/5a7f465e6))

<a name="0.13.1"></a>
## [0.13.1](https://github.com/garden-io/garden/compare/0.13.0...0.13.1) (2023-06-06)

### Bug Fixes

* pulumi module validation ([#4497](https://github.com/garden-io/garden/issues/4497)) ([a0d79f70d](https://github.com/garden-io/garden/commit/a0d79f70d))
* conftest properly convert module ([c8ac68792](https://github.com/garden-io/garden/commit/c8ac68792))
* add defaultEnv to example ([1f3e1d109](https://github.com/garden-io/garden/commit/1f3e1d109))
* terraform module validation ([#4509](https://github.com/garden-io/garden/issues/4509)) ([15483b25d](https://github.com/garden-io/garden/commit/15483b25d))
* properly wait for k8s deploys to complete ([fdb4b6ffe](https://github.com/garden-io/garden/commit/fdb4b6ffe))
* await configure provider handler call ([2de39a015](https://github.com/garden-io/garden/commit/2de39a015))
* escape rsync special characters in filenames on windows ([#4434](https://github.com/garden-io/garden/issues/4434)) ([4fbc5de89](https://github.com/garden-io/garden/commit/4fbc5de89))
* fetch-tools ([3e8df6568](https://github.com/garden-io/garden/commit/3e8df6568))
* helm module to action conversion: do not require version with name ([#4463](https://github.com/garden-io/garden/issues/4463)) ([947b91156](https://github.com/garden-io/garden/commit/947b91156))
* typo in test description ([9f89acd2d](https://github.com/garden-io/garden/commit/9f89acd2d))
* pvc modules/actions ([c1b153113](https://github.com/garden-io/garden/commit/c1b153113))
* render (log) errors ([#4439](https://github.com/garden-io/garden/issues/4439)) ([4fe827fc1](https://github.com/garden-io/garden/commit/4fe827fc1))
* typo in test description ([0077a7870](https://github.com/garden-io/garden/commit/0077a7870))
* **dev:** plugins outside of core package weren't available in dev+server ([adbd58ba6](https://github.com/garden-io/garden/commit/adbd58ba6))
* **exec:** cleaning up persistent processes didn't work in some cases ([a892b0f81](https://github.com/garden-io/garden/commit/a892b0f81))
* **jib:** `tarPath` resolution and project type detection ([#4498](https://github.com/garden-io/garden/issues/4498)) ([08d87f31a](https://github.com/garden-io/garden/commit/08d87f31a))
* **kubernetes:** do not fail to deploy List kinds (e.g. ConfigMapList) ([#4501](https://github.com/garden-io/garden/issues/4501)) ([25e1637b9](https://github.com/garden-io/garden/commit/25e1637b9))
* **serve:** fix help message of internal command ([39db05d55](https://github.com/garden-io/garden/commit/39db05d55))

### Features

* add outputs to exec provider ([7bd2a35da](https://github.com/garden-io/garden/commit/7bd2a35da))
* log exec stdout ([f1a86aa2e](https://github.com/garden-io/garden/commit/f1a86aa2e))
* add get actions, builds, deploy cmd and update get runs, tests cmd ([#4449](https://github.com/garden-io/garden/issues/4449)) ([9b539a290](https://github.com/garden-io/garden/commit/9b539a290))
* update helm to `3.12.0` ([8e8bc8093](https://github.com/garden-io/garden/commit/8e8bc8093))

<a name="0.13.0"></a>
## [0.13.0](https://github.com/garden-io/garden/compare/0.12.56...0.13.0) (2023-05-23)

### Bug Fixes

* inherit module ns in action conversion ([8ea794f5f](https://github.com/garden-io/garden/commit/8ea794f5f))
* corrected `varfiles` definition in the base action config schema ([e830a079a](https://github.com/garden-io/garden/commit/e830a079a))
* re-init the analytics handler metadata on project switch ([#4388](https://github.com/garden-io/garden/issues/4388)) ([cb3ef52d7](https://github.com/garden-io/garden/commit/cb3ef52d7))
* corrected type definition ([a0ac0bc1d](https://github.com/garden-io/garden/commit/a0ac0bc1d))
* allow default value in schema ([2f474bd0c](https://github.com/garden-io/garden/commit/2f474bd0c))
* action type schemas ([478ab9149](https://github.com/garden-io/garden/commit/478ab9149))
* fix regression in sync status cmd arg handling ([4a70a9802](https://github.com/garden-io/garden/commit/4a70a9802))
* provider resolution issues ([25609446d](https://github.com/garden-io/garden/commit/25609446d))
* utilize validation handler ([82e01cd90](https://github.com/garden-io/garden/commit/82e01cd90))
* action kind schema logic ([061870968](https://github.com/garden-io/garden/commit/061870968))
* volume action reference module conversion ([97ccc6b64](https://github.com/garden-io/garden/commit/97ccc6b64))
* corrected test name definitions ([f43dddab4](https://github.com/garden-io/garden/commit/f43dddab4))
* remove accessMode from configmap deploy spec ([1ddcaba35](https://github.com/garden-io/garden/commit/1ddcaba35))
* correctly assign cfgMap and pvc names ([8878c4524](https://github.com/garden-io/garden/commit/8878c4524))
* action names from module conversion ([346435e74](https://github.com/garden-io/garden/commit/346435e74))
* action module reference description ([aa39d5502](https://github.com/garden-io/garden/commit/aa39d5502))
* test plugin missing convert handler ([3226d1ff0](https://github.com/garden-io/garden/commit/3226d1ff0))
* some schema fixes ([7edb68ed1](https://github.com/garden-io/garden/commit/7edb68ed1))
* tiny typo in migration doc ([#4419](https://github.com/garden-io/garden/issues/4419)) ([207c0caee](https://github.com/garden-io/garden/commit/207c0caee))
* k8s pod action conversion ([3af866a62](https://github.com/garden-io/garden/commit/3af866a62))
* fixed group configs resolution ([ff7dd04fe](https://github.com/garden-io/garden/commit/ff7dd04fe))
* null-safe access to the `meta` config field ([eed64e9cb](https://github.com/garden-io/garden/commit/eed64e9cb))
* pick action kind-specific validation schema ([78b109fe6](https://github.com/garden-io/garden/commit/78b109fe6))
* volume logic and update doc ([e4952d5e9](https://github.com/garden-io/garden/commit/e4952d5e9))
* action kind router typing and configure method ([bd363877f](https://github.com/garden-io/garden/commit/bd363877f))
* handle internal fields on action config schema during validation ([688ffda6a](https://github.com/garden-io/garden/commit/688ffda6a))
* action ref handling ([4d3382ab0](https://github.com/garden-io/garden/commit/4d3382ab0))
* config graph generation ([6a0d01360](https://github.com/garden-io/garden/commit/6a0d01360))
* `get tests` schema + tests ([84231f5e7](https://github.com/garden-io/garden/commit/84231f5e7))
* `get test-result` schema + tests ([5b1dc7e73](https://github.com/garden-io/garden/commit/5b1dc7e73))
* fixed test assertions in `deleteExecService` spec ([1fd8b9898](https://github.com/garden-io/garden/commit/1fd8b9898))
* errors in action resolution flow ([101ea2bd3](https://github.com/garden-io/garden/commit/101ea2bd3))
* remove duplicate key from pvc provider items ([0eba7853e](https://github.com/garden-io/garden/commit/0eba7853e))
* validate via resolution ([a3cbf42cf](https://github.com/garden-io/garden/commit/a3cbf42cf))
* fix result schema of delete deploy action ([654f4b033](https://github.com/garden-io/garden/commit/654f4b033))
* update core/src/graph/config-graph.ts ([2c15e0b3a](https://github.com/garden-io/garden/commit/2c15e0b3a))
* fix search predicate in `Run` action detection ([c07f6e7cd](https://github.com/garden-io/garden/commit/c07f6e7cd))
* set defaultEnv default value ([be196f468](https://github.com/garden-io/garden/commit/be196f468))
* review comments ([10f26d03e](https://github.com/garden-io/garden/commit/10f26d03e))
* loading actions from source tree ([f5ab3fee3](https://github.com/garden-io/garden/commit/f5ab3fee3))
* handle chart with url as remote ([0a978de9d](https://github.com/garden-io/garden/commit/0a978de9d))
* make sure cacheTo returns proper list ([#4253](https://github.com/garden-io/garden/issues/4253)) ([1eacc4a58](https://github.com/garden-io/garden/commit/1eacc4a58))
* conftest plugin compilation errors ([35d0343bc](https://github.com/garden-io/garden/commit/35d0343bc))
* re-initialize providers changing environments ([#3481](https://github.com/garden-io/garden/issues/3481)) ([3401f4946](https://github.com/garden-io/garden/commit/3401f4946))
* fixed relative path resolution in build staging sync ([ae846b907](https://github.com/garden-io/garden/commit/ae846b907))
* empty action group when converting basic exec module ([ff991ff01](https://github.com/garden-io/garden/commit/ff991ff01))
* add the required apiVersion field ([9a09f8004](https://github.com/garden-io/garden/commit/9a09f8004))
* add actionType to log events ([f0f2e0283](https://github.com/garden-io/garden/commit/f0f2e0283))
* ignore historic kill events ([0346a7479](https://github.com/garden-io/garden/commit/0346a7479))
* properly unmount dev react FC ([b21d8ba79](https://github.com/garden-io/garden/commit/b21d8ba79))
* ensure proper usage of remote actions ([36bb666ec](https://github.com/garden-io/garden/commit/36bb666ec))
* fix source build dir initialization and syncing ([9098fab07](https://github.com/garden-io/garden/commit/9098fab07))
* schema fixes around k8s/container conversion ([733f0c5a7](https://github.com/garden-io/garden/commit/733f0c5a7))
* await mutagen command ([e3041f76e](https://github.com/garden-io/garden/commit/e3041f76e))
* fix typing problems in circular dep logic ([78987f55f](https://github.com/garden-io/garden/commit/78987f55f))
* fixed task dependencies resolution ([b42b93a04](https://github.com/garden-io/garden/commit/b42b93a04))
* add backwards compatibility for old-style run commands ([#4195](https://github.com/garden-io/garden/issues/4195)) ([8f5218d25](https://github.com/garden-io/garden/commit/8f5218d25))
* restore spec and vars after action validation ([16ccd2845](https://github.com/garden-io/garden/commit/16ccd2845))
* fix result schema definition of `configure` action handler ([3cf92b442](https://github.com/garden-io/garden/commit/3cf92b442))
* pulumi action config handler bug ([e5f95b293](https://github.com/garden-io/garden/commit/e5f95b293))
* added missing schema field definition ([72e559763](https://github.com/garden-io/garden/commit/72e559763))
* fixed field name in xor condition of action source schema ([2f711fa39](https://github.com/garden-io/garden/commit/2f711fa39))
* fixed container deploy schema definition ([0e85ae9cd](https://github.com/garden-io/garden/commit/0e85ae9cd))
* some module conversion issues ([fc91a65a9](https://github.com/garden-io/garden/commit/fc91a65a9))
* custom commands: spread true ([8590e7b94](https://github.com/garden-io/garden/commit/8590e7b94))
* values for sync perms ([c70d3db87](https://github.com/garden-io/garden/commit/c70d3db87))
* throw when test or run is not found ([f99db5321](https://github.com/garden-io/garden/commit/f99db5321))
* do not throw if no action kinds & garden.io/v0 ([#4162](https://github.com/garden-io/garden/issues/4162)) ([d0db6904f](https://github.com/garden-io/garden/commit/d0db6904f))
* fixed action kind detection in `getActionTemplateReferences` ([70d0db412](https://github.com/garden-io/garden/commit/70d0db412))
* return action-specific params in `getDependencyParams()` ([90187b58d](https://github.com/garden-io/garden/commit/90187b58d))
* return `startSync` flag in `DeployTaskParams` ([c823cd9ea](https://github.com/garden-io/garden/commit/c823cd9ea))
* action router test plugin ([8811a28eb](https://github.com/garden-io/garden/commit/8811a28eb))
* action resolution flow ([9d50a7a05](https://github.com/garden-io/garden/commit/9d50a7a05))
* temporary hard-code 0.13.0 version in api client ([a3d2306cb](https://github.com/garden-io/garden/commit/a3d2306cb))
* configmap getK8sAction return ([aabfe4c2c](https://github.com/garden-io/garden/commit/aabfe4c2c))
* use default target in sync overrides ([6408f2e1f](https://github.com/garden-io/garden/commit/6408f2e1f))
* 0.13 export the status state-field consistently across action types ([#4073](https://github.com/garden-io/garden/issues/4073)) ([0e8fea793](https://github.com/garden-io/garden/commit/0e8fea793))
* fixed `actionConfigs` schema definition ([c0c0e2d63](https://github.com/garden-io/garden/commit/c0c0e2d63))
* properly give plugin name in error ([401c21c2b](https://github.com/garden-io/garden/commit/401c21c2b))
* initialize logger when not present ([e54012f58](https://github.com/garden-io/garden/commit/e54012f58))
* use the correct secret in pullFromExternalRegistry in kaniko builds ([#4094](https://github.com/garden-io/garden/issues/4094)) ([#4096](https://github.com/garden-io/garden/issues/4096)) ([1a2a6d868](https://github.com/garden-io/garden/commit/1a2a6d868))
* login/logout using the configured domain ([#4050](https://github.com/garden-io/garden/issues/4050)) ([1e444e741](https://github.com/garden-io/garden/commit/1e444e741))
* missing resolve task dependency for delete task ([c50d37a9f](https://github.com/garden-io/garden/commit/c50d37a9f))
* post-rebase errors ([d91bcf626](https://github.com/garden-io/garden/commit/d91bcf626))
* run action result processing ([b9032f977](https://github.com/garden-io/garden/commit/b9032f977))
* exec and test plugin schema issues ([027133530](https://github.com/garden-io/garden/commit/027133530))
* prevent `exec` command from running any deployments ([#4052](https://github.com/garden-io/garden/issues/4052)) ([915213cef](https://github.com/garden-io/garden/commit/915213cef))
* add mode annotation to getManifests ([3acf83287](https://github.com/garden-io/garden/commit/3acf83287))
* fix getDockerVersion helper ([f1117944f](https://github.com/garden-io/garden/commit/f1117944f))
* include updated action in watch tasks ([631c0ed4f](https://github.com/garden-io/garden/commit/631c0ed4f))
* action getFullVersion crash if dep is disabled ([019b2acef](https://github.com/garden-io/garden/commit/019b2acef))
* k8s pod action conversin ([c9b1081f6](https://github.com/garden-io/garden/commit/c9b1081f6))
* validate all runtime container actions ([75545cf9a](https://github.com/garden-io/garden/commit/75545cf9a))
* don't throw on a disabled build dependency ([7af89da22](https://github.com/garden-io/garden/commit/7af89da22))
* **autocomplete:** handle single-char option flag aliases properly ([14ee002cc](https://github.com/garden-io/garden/commit/14ee002cc))
* **build:** rsync version check was run prematurely (i.e. even if disabled) ([85018e522](https://github.com/garden-io/garden/commit/85018e522))
* **cli:** error running noProject command (e.g. login) with default env set ([c4127b38f](https://github.com/garden-io/garden/commit/c4127b38f))
* **cli:** error in `get status` command + updated tests ([a25f6b699](https://github.com/garden-io/garden/commit/a25f6b699))
* **cli:** test command would hang if --interactive=true ([3e34189cc](https://github.com/garden-io/garden/commit/3e34189cc))
* **cli:** failure in self-update command due to GitHub API change ([17f574c47](https://github.com/garden-io/garden/commit/17f574c47))
* **cli:** error when trying to clear default env with `set default-env ''` ([5898f7d4e](https://github.com/garden-io/garden/commit/5898f7d4e))
* **cli:** correctly handle multiple opt aliases ([87cfb47c6](https://github.com/garden-io/garden/commit/87cfb47c6))
* **cli:** command-specified logger type wasn't respected ([066416702](https://github.com/garden-io/garden/commit/066416702))
* **cli:** don't throw in dev command if offline ([dee5868bc](https://github.com/garden-io/garden/commit/dee5868bc))
* **cli:** util fetch-tools command would not error if run outside project dir ([30907db73](https://github.com/garden-io/garden/commit/30907db73))
* **cli:** throw if no tests/runs are found ([2040bcaef](https://github.com/garden-io/garden/commit/2040bcaef))
* **cloud:** continue when token refresh fails ([#3814](https://github.com/garden-io/garden/issues/3814)) ([361381a98](https://github.com/garden-io/garden/commit/361381a98))
* **cloud:** rework some things to better support Cloud API integration ([a2330df80](https://github.com/garden-io/garden/commit/a2330df80))
* **cloud:** update to use UUIDs ([#3834](https://github.com/garden-io/garden/issues/3834)) ([90c39a6f5](https://github.com/garden-io/garden/commit/90c39a6f5))
* **commands:** make test `-n` option backwards compatible to 0.12 ([#4208](https://github.com/garden-io/garden/issues/4208)) ([feb576090](https://github.com/garden-io/garden/commit/feb576090))
* **commands:** fix broken tests ([b13e07fba](https://github.com/garden-io/garden/commit/b13e07fba))
* **commands:** ensure cloning works for all commands ([1be0cdff5](https://github.com/garden-io/garden/commit/1be0cdff5))
* **config:** superfluous configPath field on action configs from disk ([82d418730](https://github.com/garden-io/garden/commit/82d418730))
* **config:** ensure a path is set on augmentGraph actions ([813a5a6e8](https://github.com/garden-io/garden/commit/813a5a6e8))
* **config:** issues with template resolution on built-in action config fields ([ad1588454](https://github.com/garden-io/garden/commit/ad1588454))
* **config:** fixed module conversion handler name ([f8a47418d](https://github.com/garden-io/garden/commit/f8a47418d))
* **config:** allow actions to be referenced in action variables ([685023739](https://github.com/garden-io/garden/commit/685023739))
* **config:** application of default values on resolve action spec ([950e8a468](https://github.com/garden-io/garden/commit/950e8a468))
* **container:** detached container build spec from `BaseBuildSpec` ([92edb7200](https://github.com/garden-io/garden/commit/92edb7200))
* **container:** ensure error message is properly indented ([8f2d7df47](https://github.com/garden-io/garden/commit/8f2d7df47))
* **container:** incorrect working directory when calling docker CLI ([4c816700d](https://github.com/garden-io/garden/commit/4c816700d))
* **container:** fix spec.image in container conversion ([7be72b6d8](https://github.com/garden-io/garden/commit/7be72b6d8))
* **container:** module conversion and schema issues ([a86fbdb57](https://github.com/garden-io/garden/commit/a86fbdb57))
* **core:** issues with disabled actions and BuildCommand tests ([4aab2254c](https://github.com/garden-io/garden/commit/4aab2254c))
* **core:** handling of action type base definitions and extensions ([95aae5870](https://github.com/garden-io/garden/commit/95aae5870))
* **core:** rework and fix handling of static+runtime action outputs ([d54f8e370](https://github.com/garden-io/garden/commit/d54f8e370))
* **core:** improve graph result filtering ([#3911](https://github.com/garden-io/garden/issues/3911)) ([761745ff4](https://github.com/garden-io/garden/commit/761745ff4))
* **core:** error when attempting to emit warning message ([69f4f8b99](https://github.com/garden-io/garden/commit/69f4f8b99))
* **core:** only emit ready event once per task ([a4a95b782](https://github.com/garden-io/garden/commit/a4a95b782))
* **core:** improve event listener cleanup ([c95e3d599](https://github.com/garden-io/garden/commit/c95e3d599))
* **core:** override Build version with module ([#3908](https://github.com/garden-io/garden/issues/3908)) ([13f2b7d8d](https://github.com/garden-io/garden/commit/13f2b7d8d))
* **core:** reintroduce kind-specific cmd outputs ([34a56581a](https://github.com/garden-io/garden/commit/34a56581a))
* **core:** allowed undefined values in mapped types ([26ec7ec57](https://github.com/garden-io/garden/commit/26ec7ec57))
* **core:** get test command working ([a58b0fafb](https://github.com/garden-io/garden/commit/a58b0fafb))
* **core:** prevent mutations on action configs, which could mess up versions ([50ec33582](https://github.com/garden-io/garden/commit/50ec33582))
* **core:** issues with validation and handling of base handlers on action types ([b091ff91d](https://github.com/garden-io/garden/commit/b091ff91d))
* **core:** always ignore .garden directory when scanning for configs ([6b0077fc4](https://github.com/garden-io/garden/commit/6b0077fc4))
* **core:** various issues with action/runtime template references ([ab1447f81](https://github.com/garden-io/garden/commit/ab1447f81))
* **core:** incorrect action version resolution in some cases ([e557a43f3](https://github.com/garden-io/garden/commit/e557a43f3))
* **core:** incorrect schema used for action configure handler ([5acbe65d2](https://github.com/garden-io/garden/commit/5acbe65d2))
* **core:** more narrow set of config fields to hash for module versions ([c17a6cfbd](https://github.com/garden-io/garden/commit/c17a6cfbd))
* **core:** don't log error details in terminal renderer ([4b0cba82e](https://github.com/garden-io/garden/commit/4b0cba82e))
* **core:** initialize `compatibleTypes` of a base action in the ctor ([713f89d72](https://github.com/garden-io/garden/commit/713f89d72))
* **core:** serializing error detail could explode ([f2a165107](https://github.com/garden-io/garden/commit/f2a165107))
* **core:** don't warn about missing sync handlers ([9526f7828](https://github.com/garden-io/garden/commit/9526f7828))
* **core:** fix `delete environment` --with-dependants flag + tests ([89be0690b](https://github.com/garden-io/garden/commit/89be0690b))
* **core:** error when referencing a disabled Build action in Deploy ([da28dd9fc](https://github.com/garden-io/garden/commit/da28dd9fc))
* **core:** schema error in module resolution ([2865a7d34](https://github.com/garden-io/garden/commit/2865a7d34))
* **deploy:** watch triggers for module config files weren't firing correctly ([f86e1828c](https://github.com/garden-io/garden/commit/f86e1828c))
* **deploy:** error when running with --sync flag via API server ([6bf33000c](https://github.com/garden-io/garden/commit/6bf33000c))
* **deploy:** port-forwards weren't being started ([7d6a2fd1b](https://github.com/garden-io/garden/commit/7d6a2fd1b))
* **deploy:** duplicate log entry when deploying ([df16e1afe](https://github.com/garden-io/garden/commit/df16e1afe))
* **dev:** register session with Cloud/Enterprise on server start ([e81d4c698](https://github.com/garden-io/garden/commit/e81d4c698))
* **dev:** crash when specifying bad command arguments ([d5c73bbc9](https://github.com/garden-io/garden/commit/d5c73bbc9))
* **dev:** fix changed sources not being detected ([dd444d19f](https://github.com/garden-io/garden/commit/dd444d19f))
* **dev:** autocomplete for partially entered option flags ([8e8edd3fe](https://github.com/garden-io/garden/commit/8e8edd3fe))
* **dev:** not all commands would be loaded on config load/reload ([18f06be51](https://github.com/garden-io/garden/commit/18f06be51))
* **dev:** trim trailing whitespace from cmd args ([5d4560227](https://github.com/garden-io/garden/commit/5d4560227))
* **dev:** handle most characters and symbols in the command input ([51d842174](https://github.com/garden-io/garden/commit/51d842174))
* **dev:** fix config-contextual autocomplete suggestions ([b2ea68f92](https://github.com/garden-io/garden/commit/b2ea68f92))
* **dev:** disallow persistent commands in the dev console ([f60babd2b](https://github.com/garden-io/garden/commit/f60babd2b))
* **dev:** handle -h/--help and print help if command group is matched ([8617bdc07](https://github.com/garden-io/garden/commit/8617bdc07))
* **dev:** correctly update autocompletes after config reload ([1d166c56f](https://github.com/garden-io/garden/commit/1d166c56f))
* **dev:** don't throw if other process is on default port ([317c6ac19](https://github.com/garden-io/garden/commit/317c6ac19))
* **dev:** login and logout commands didn't work in dev command ([7f93b9083](https://github.com/garden-io/garden/commit/7f93b9083))
* **dev:** pasting text didn't work ([582cffd4c](https://github.com/garden-io/garden/commit/582cffd4c))
* **dev:** bad server error handling + error when running deploy --dev/--sync ([4ac62cd7c](https://github.com/garden-io/garden/commit/4ac62cd7c))
* **dev-mode:** [post-merge fix] proper support of absolute source paths ([68921ffad](https://github.com/garden-io/garden/commit/68921ffad))
* **docs:** fix broken links ([8067b9bd6](https://github.com/garden-io/garden/commit/8067b9bd6))
* **docs:** move pvc shared volumes info to the right page ([2f8820375](https://github.com/garden-io/garden/commit/2f8820375))
* **events:** update log event timestamp type be string or number ([332657e61](https://github.com/garden-io/garden/commit/332657e61))
* **events:** stream configChanged and configsScanned events ([4bc9fd7ec](https://github.com/garden-io/garden/commit/4bc9fd7ec))
* **example:** correct entrypoint in `Dockerfile` in base-image example ([f211e79fd](https://github.com/garden-io/garden/commit/f211e79fd))
* **exec:** do not show outdated warning for in case of sync mode ([#4375](https://github.com/garden-io/garden/issues/4375)) ([d8ca2ecb3](https://github.com/garden-io/garden/commit/d8ca2ecb3))
* **exec:** issues with log output propagation and env vars ([5502628fe](https://github.com/garden-io/garden/commit/5502628fe))
* **exec:** more informative error msg on timeout ([#3584](https://github.com/garden-io/garden/issues/3584)) ([a530afdeb](https://github.com/garden-io/garden/commit/a530afdeb))
* **exec:** superfluous spec fields in conversion from modules to actions ([2275fb270](https://github.com/garden-io/garden/commit/2275fb270))
* **exec:** prevent `ExecModuleBuildSpec` from extending `BaseBuildSpec` ([58512dc65](https://github.com/garden-io/garden/commit/58512dc65))
* **exec:** fix delete handler for persistent mode ([646b74a7e](https://github.com/garden-io/garden/commit/646b74a7e))
* **exec:** env variables from action specs were not properly propagated ([356e94fd5](https://github.com/garden-io/garden/commit/356e94fd5))
* **framework:** increase consistency in verbose plugin logs ([23ad49486](https://github.com/garden-io/garden/commit/23ad49486))
* **framework:** inherit metadata in createActionLog ([#4233](https://github.com/garden-io/garden/issues/4233)) ([dd1fe4da2](https://github.com/garden-io/garden/commit/dd1fe4da2))
* **get-config:** error in output schema ([5e96f792e](https://github.com/garden-io/garden/commit/5e96f792e))
* **git:** allow local submodules (prohibited by default in recent git versions) ([c7d794105](https://github.com/garden-io/garden/commit/c7d794105))
* **hadolint:** enable timeout in hadolint test config ([30cfc5733](https://github.com/garden-io/garden/commit/30cfc5733))
* **hadolint:** attempt to fix schema validation issue ([d7690ea3f](https://github.com/garden-io/garden/commit/d7690ea3f))
* **hadolint:** fix internal config path initialization ([a7b03beff](https://github.com/garden-io/garden/commit/a7b03beff))
* **hadolint:** correct Dockerfile path construction ([b7c95d78b](https://github.com/garden-io/garden/commit/b7c95d78b))
* **hadolint:** fix Dockerfile path processing for different specs ([c47ed636b](https://github.com/garden-io/garden/commit/c47ed636b))
* **hadolint:** fixed description string ([0970e74c8](https://github.com/garden-io/garden/commit/0970e74c8))
* **helm:** fix conversion when skipDeploy = true ([74be91175](https://github.com/garden-io/garden/commit/74be91175))
* **helm:** correctly handle values file path and chart references ([089b41c75](https://github.com/garden-io/garden/commit/089b41c75))
* **helm:** fix base chart logic for helm modules ([f27cebf30](https://github.com/garden-io/garden/commit/f27cebf30))
* **helm:** stream logs to CLI and Garden Cloud ([#3582](https://github.com/garden-io/garden/issues/3582)) ([80cb1cf45](https://github.com/garden-io/garden/commit/80cb1cf45))
* **helm:** fix status checks around code syncing ([7bb9a2d58](https://github.com/garden-io/garden/commit/7bb9a2d58))
* **install:** remove unnecessary rsync dependency in homebrew formula ([465c3e222](https://github.com/garden-io/garden/commit/465c3e222))
* **jib:** fixed broken Maven Daemon support in 0.13 ([196da0862](https://github.com/garden-io/garden/commit/196da0862))
* **jib:** remove `timeout` from build action spec ([22f6426b5](https://github.com/garden-io/garden/commit/22f6426b5))
* **jib:** fix spec creation in jib module converter ([bf14b2e5a](https://github.com/garden-io/garden/commit/bf14b2e5a))
* **k8s:** fix persistentvolumeclaim Deploy actions ([ff7193604](https://github.com/garden-io/garden/commit/ff7193604))
* **k8s:** incorrect annotations on stored Run and Test results ([5da01264f](https://github.com/garden-io/garden/commit/5da01264f))
* **k8s:** fix k8s module-to-action conversion ([030975d37](https://github.com/garden-io/garden/commit/030975d37))
* **k8s:** error when getting status of container Deploy in sync mode ([584fe23ae](https://github.com/garden-io/garden/commit/584fe23ae))
* **k8s:** fix namespace caching logic for dev cmd ([706ecab79](https://github.com/garden-io/garden/commit/706ecab79))
* **k8s:** stop retrying in LogFollower when Pod is in terminal phase ([6ddd2d051](https://github.com/garden-io/garden/commit/6ddd2d051))
* **k8s:** error in status checks in exec handlers ([724224040](https://github.com/garden-io/garden/commit/724224040))
* **k8s:** typo in volume access modes module conversion ([23de55a24](https://github.com/garden-io/garden/commit/23de55a24))
* **k8s:** pod spec schema properly defined on kubernetes-pod action types ([abc8a2891](https://github.com/garden-io/garden/commit/abc8a2891))
* **k8s:** fix Helm Tests, Runs and dev mode specs ([fb5126946](https://github.com/garden-io/garden/commit/fb5126946))
* **k8s:** container deploy handler might return non-ready status ([1a9062d14](https://github.com/garden-io/garden/commit/1a9062d14))
* **k8s:** retry exec attempts in PodRunner ([#3956](https://github.com/garden-io/garden/issues/3956)) ([199fe4b1d](https://github.com/garden-io/garden/commit/199fe4b1d))
* **k8s:** add log streaming for exec Runs/Tests ([9dc877003](https://github.com/garden-io/garden/commit/9dc877003))
* **k8s:** bad label on container Deployment manifest ([413029783](https://github.com/garden-io/garden/commit/413029783))
* **k8s:** delete handler for container deploys wasn't wired up ([065eb7ad9](https://github.com/garden-io/garden/commit/065eb7ad9))
* **k8s:** fix sync destination formatting issue ([dca1eedbc](https://github.com/garden-io/garden/commit/dca1eedbc))
* **k8s:** fixed resource file processing in `configure` action handler ([e2974d9d0](https://github.com/garden-io/garden/commit/e2974d9d0))
* **k8s:** fixed dev mode for `container` services ([3a6ee5bd4](https://github.com/garden-io/garden/commit/3a6ee5bd4))
* **k8s:** bad error handling when initializing system services ([ab7c9d8b8](https://github.com/garden-io/garden/commit/ab7c9d8b8))
* **k8s:** more stable & performant log streaming ([#3730](https://github.com/garden-io/garden/issues/3730)) ([70815f5b4](https://github.com/garden-io/garden/commit/70815f5b4))
* **k8s:** error during helm module conversion ([d65471563](https://github.com/garden-io/garden/commit/d65471563))
* **kubernetes:** make preStop command work with busybox ([#3568](https://github.com/garden-io/garden/issues/3568)) ([4aa014124](https://github.com/garden-io/garden/commit/4aa014124))
* **kubernetes:** detect that pod has been killed ([#3571](https://github.com/garden-io/garden/issues/3571)) ([9ca9e85a7](https://github.com/garden-io/garden/commit/9ca9e85a7))
* **local-mode:** fix ssh key names for local mode ([5b3a7270d](https://github.com/garden-io/garden/commit/5b3a7270d))
* **log:** inherit log context on action logs ([7890e8c53](https://github.com/garden-io/garden/commit/7890e8c53))
* **logger:** ensure we print emoji instead of text description ([53c12945b](https://github.com/garden-io/garden/commit/53c12945b))
* **logger:** ensure 'fixLevel' is used properly ([8dc35a28c](https://github.com/garden-io/garden/commit/8dc35a28c))
* **logs:** exit with error if services not found when getting logs ([870ab90fb](https://github.com/garden-io/garden/commit/870ab90fb))
* **logs:** ensure logs command sets tail/since flags properly ([936bc91a2](https://github.com/garden-io/garden/commit/936bc91a2))
* **monitors:** properly unsubscribe subscribers (flagged in review) ([6eaa17b33](https://github.com/garden-io/garden/commit/6eaa17b33))
* **monitors:** ensure status isn't overwritten due to a race condition ([de17fc30c](https://github.com/garden-io/garden/commit/de17fc30c))
* **monitors:** handle unsubscribes at manager level ([db19e297a](https://github.com/garden-io/garden/commit/db19e297a))
* **plugins:** ensure PluginEventBroker is correctly passed to PluginContext ([23da54c83](https://github.com/garden-io/garden/commit/23da54c83))
* **scripts:** release.ts unintentionally also ran scripts ([#3626](https://github.com/garden-io/garden/issues/3626)) ([89b55d39c](https://github.com/garden-io/garden/commit/89b55d39c))
* **serve:** ensure Garden instance is resolved with Cloud API ([a1f091ca5](https://github.com/garden-io/garden/commit/a1f091ca5))
* **serve:** ensure cloud session is set on buffered event stream ([acf3f5f73](https://github.com/garden-io/garden/commit/acf3f5f73))
* **serve:** use process session ID when registering server session ([ac3b22c58](https://github.com/garden-io/garden/commit/ac3b22c58))
* **serve:** ensure buffered event stream works with serve commands ([72761a868](https://github.com/garden-io/garden/commit/72761a868))
* **server:** do not filter subscription when emitting events ([e6a93857e](https://github.com/garden-io/garden/commit/e6a93857e))
* **server:** stop using dummy env when registering cloud session ([a34a284a1](https://github.com/garden-io/garden/commit/a34a284a1))
* **server:** handle projectRoot request parameter correctly ([87ccedd94](https://github.com/garden-io/garden/commit/87ccedd94))
* **server:** set correct parent session ID for ws commands ([c55ad7a28](https://github.com/garden-io/garden/commit/c55ad7a28))
* **server:** ensure fresh command instance per request ([4312b3526](https://github.com/garden-io/garden/commit/4312b3526))
* **server:** use server session ID for load config event ([85de1a8b3](https://github.com/garden-io/garden/commit/85de1a8b3))
* **server:** handle command errors better ([3b45f79e5](https://github.com/garden-io/garden/commit/3b45f79e5))
* **server:** errors in abortCommand and loadConfig requests in cloud projects ([f738873f7](https://github.com/garden-io/garden/commit/f738873f7))
* **server:** fixes to load config handler ([9a31470aa](https://github.com/garden-io/garden/commit/9a31470aa))
* **server:** ensure we clear tree cache before ws command runs ([28d131bc5](https://github.com/garden-io/garden/commit/28d131bc5))
* **server:** ensure GARDEN_SERVER_PORT env var is respected ([65d113258](https://github.com/garden-io/garden/commit/65d113258))
* **server:** errors in output serialization ([d76b69640](https://github.com/garden-io/garden/commit/d76b69640))
* **server:** no project commands would fail if using secrets ([c0765833e](https://github.com/garden-io/garden/commit/c0765833e))
* **server:** ensure server logs aren't emitted twice ([b591fdef6](https://github.com/garden-io/garden/commit/b591fdef6))
* **server:** ensure ws connection is closed on Garden "_exit" event ([0ad64094e](https://github.com/garden-io/garden/commit/0ad64094e))
* **solver:** ready status was ignored for several task types ([4b12a96f3](https://github.com/garden-io/garden/commit/4b12a96f3))
* **solver:** error in handling status during graph execution ([23e464c91](https://github.com/garden-io/garden/commit/23e464c91))
* **solver:** deadlock when running multiple solver instances ([dfb13c80d](https://github.com/garden-io/garden/commit/dfb13c80d))
* **solver:** results were not cleaned up on error in all cases ([16ae3a576](https://github.com/garden-io/garden/commit/16ae3a576))
* **solver:** error when processing zero tasks ([1329fe3af](https://github.com/garden-io/garden/commit/1329fe3af))
* **sync:** ensure key uniqueness for syncs ([f5c67302b](https://github.com/garden-io/garden/commit/f5c67302b))
* **sync-mode:** fix source path definition in config schema ([8062450e2](https://github.com/garden-io/garden/commit/8062450e2))
* **sync-mode:** ensure project mutagen dir exists ([f1fecb8c1](https://github.com/garden-io/garden/commit/f1fecb8c1))
* **sync-mode:** fix predicate in init container matcher ([612187411](https://github.com/garden-io/garden/commit/612187411))
* **syncs:** do not read status if sync session is not defined ([0c9641ff2](https://github.com/garden-io/garden/commit/0c9641ff2))
* **terraform:** fix checksums for terraform 1.2.9 darwin builds ([#3630](https://github.com/garden-io/garden/issues/3630)) ([ced0e3c43](https://github.com/garden-io/garden/commit/ced0e3c43))
* **terraform:** update condition to trigger tf init ([#3632](https://github.com/garden-io/garden/issues/3632)) ([6c17c7f62](https://github.com/garden-io/garden/commit/6c17c7f62))
* **terraform:** improve init behaviour on validate and error messages ([#3663](https://github.com/garden-io/garden/issues/3663)) ([49cb253e6](https://github.com/garden-io/garden/commit/49cb253e6))
* **tests:** handle log entry messages in ws tests ([2e52a1d77](https://github.com/garden-io/garden/commit/2e52a1d77))
* **tests:** fix a broken logger test ([80f5b2f9a](https://github.com/garden-io/garden/commit/80f5b2f9a))

### Features

* retry k8s api calls on ECONNREFUSED and 500 errors ([b43841420](https://github.com/garden-io/garden/commit/b43841420))
* support pre-release versions in `self-update` command ([#4022](https://github.com/garden-io/garden/issues/4022)) ([91179f1e2](https://github.com/garden-io/garden/commit/91179f1e2))
* support multiple envs and projects in dev and serve commands ([7edf9ac2e](https://github.com/garden-io/garden/commit/7edf9ac2e))
* add action type reference docs ([8e23e6fdf](https://github.com/garden-io/garden/commit/8e23e6fdf))
* add "sync status" command ([50f01cff6](https://github.com/garden-io/garden/commit/50f01cff6))
* add `garden up` cmd as alias for `deploy --logs` ([af0b44caa](https://github.com/garden-io/garden/commit/af0b44caa))
* add `sync start` and `sync stop` commands ([5a805cca7](https://github.com/garden-io/garden/commit/5a805cca7))
* allow `-i` alias for interactive mode in `exec` command ([330af45e8](https://github.com/garden-io/garden/commit/330af45e8))
* remaining actionTypes ([54c429f12](https://github.com/garden-io/garden/commit/54c429f12))
* remove commented fields from create commands ([b0d3383b3](https://github.com/garden-io/garden/commit/b0d3383b3))
* add self-managed state backends to pulumi stacks ([#4107](https://github.com/garden-io/garden/issues/4107)) ([7a5f5587a](https://github.com/garden-io/garden/commit/7a5f5587a))
* 0.13 login without project ([#4172](https://github.com/garden-io/garden/issues/4172)) ([71bc64974](https://github.com/garden-io/garden/commit/71bc64974))
* `garden community` command ([#4129](https://github.com/garden-io/garden/issues/4129)) ([9099e0c22](https://github.com/garden-io/garden/commit/9099e0c22))
* **cli:** support spread positional arguments ([492dd3601](https://github.com/garden-io/garden/commit/492dd3601))
* **cli:** add --interactive flag to test command ([015b36746](https://github.com/garden-io/garden/commit/015b36746))
* **cli:** add `util mutagen` command to ease troubleshooting sync issues ([064ea8287](https://github.com/garden-io/garden/commit/064ea8287))
* **cli:** new, minty fresh interactive dev command ([68fb22c0c](https://github.com/garden-io/garden/commit/68fb22c0c))
* **cli:** add `set default-env` command ([1063403ef](https://github.com/garden-io/garden/commit/1063403ef))
* **cloud:** garden cloud dashboard fallback ([#3666](https://github.com/garden-io/garden/issues/3666)) ([6488c13c6](https://github.com/garden-io/garden/commit/6488c13c6))
* **commands:** add experimental watch disable flag for dev mode ([9c4b69d50](https://github.com/garden-io/garden/commit/9c4b69d50))
* **config:** add sourcePath and buildPath keys to action template references ([87af35c3a](https://github.com/garden-io/garden/commit/87af35c3a))
* **config:** add ${this.mode} template variable to action spec context ([b44c725e2](https://github.com/garden-io/garden/commit/b44c725e2))
* **config:** templating for actions and workflows + new RenderTemplate kind ([9ec9ccd03](https://github.com/garden-io/garden/commit/9ec9ccd03))
* **config:** add $if/$else/$then conditional objects ([#3907](https://github.com/garden-io/garden/issues/3907)) ([350d1f789](https://github.com/garden-io/garden/commit/350d1f789))
* **core:** support remote repositories for action sources ([9e2049192](https://github.com/garden-io/garden/commit/9e2049192))
* **core:** --logs option for deploy command ([1f0b265aa](https://github.com/garden-io/garden/commit/1f0b265aa))
* **core:** allow multiple Runs in `garden run` and add watch mode ([62ab928c1](https://github.com/garden-io/garden/commit/62ab928c1))
* **core:** added sync restart command ([3103dece0](https://github.com/garden-io/garden/commit/3103dece0))
* **dev:** add --cmd flag to dev command to run commands on startup ([305065aa3](https://github.com/garden-io/garden/commit/305065aa3))
* **dev:** support persistent commands (logs, deploy --sync/local etc) in dev ([f011fce72](https://github.com/garden-io/garden/commit/f011fce72))
* **dev:** show status message while running commands ([6920ab54d](https://github.com/garden-io/garden/commit/6920ab54d))
* **dev:** add autocomplete, reload and log-level commands to API server ([0b5eea37e](https://github.com/garden-io/garden/commit/0b5eea37e))
* **dev:** add blinking cursor ([8ede9617d](https://github.com/garden-io/garden/commit/8ede9617d))
* **dev:** add reload command to dev console ([0f36fd512](https://github.com/garden-io/garden/commit/0f36fd512))
* **dockerhub:** publish rootless containers ([#4274](https://github.com/garden-io/garden/issues/4274)) ([f67000c64](https://github.com/garden-io/garden/commit/f67000c64))
* **examples:** add GitOps example based on ArgoCD ([931480587](https://github.com/garden-io/garden/commit/931480587))
* **exec:** add explicit `shell: true` option to exec action specs ([f972f4ec5](https://github.com/garden-io/garden/commit/f972f4ec5))
* **k8s:** kubernetes-exec Runs and Tests ([5a886e653](https://github.com/garden-io/garden/commit/5a886e653))
* **kubernetes:** add sync helper commands ([acaa4e8bf](https://github.com/garden-io/garden/commit/acaa4e8bf))
* **plugins:** set the manifest to unknown if repository is not found ([#4236](https://github.com/garden-io/garden/issues/4236)) ([042cc20e1](https://github.com/garden-io/garden/commit/042cc20e1))
* **server:** stream log entries over ws ([b02e03942](https://github.com/garden-io/garden/commit/b02e03942))
* **server:** add autocomplete request type for faster handling ([c728c84b5](https://github.com/garden-io/garden/commit/c728c84b5))

### Improvements

* set defaultTarget in module converter ([e665ff826](https://github.com/garden-io/garden/commit/e665ff826))
* more granular version control in `self-update` command ([#3999](https://github.com/garden-io/garden/issues/3999)) ([4f45a294b](https://github.com/garden-io/garden/commit/4f45a294b))
* support only single dotIgnoreFile ([#3069](https://github.com/garden-io/garden/issues/3069)) ([8ecde239a](https://github.com/garden-io/garden/commit/8ecde239a))
* always print ingress urls in console ([47e807eaf](https://github.com/garden-io/garden/commit/47e807eaf))
* removed error-prone local ip inference ([b52ac025c](https://github.com/garden-io/garden/commit/b52ac025c))
* support static keys to avoid unnecessary action execution ([182d8a0ea](https://github.com/garden-io/garden/commit/182d8a0ea))
* track the command run result and duration ([#3837](https://github.com/garden-io/garden/issues/3837)) ([2cf819dcb](https://github.com/garden-io/garden/commit/2cf819dcb))
* add additional info to error message when sh is not found ([071fdcb02](https://github.com/garden-io/garden/commit/071fdcb02))
* deduplicate deploy status logs for ready statuses ([31efbf16f](https://github.com/garden-io/garden/commit/31efbf16f))
* **api:** allow unstructured string arguments in HTTP API commands ([#4035](https://github.com/garden-io/garden/issues/4035)) ([37616d57b](https://github.com/garden-io/garden/commit/37616d57b))
* **autocomplete:** handful of small improvements based on feedback ([babd2c2b3](https://github.com/garden-io/garden/commit/babd2c2b3))
* **cli:** detect calls to removed run cmds ([8ba1b81b8](https://github.com/garden-io/garden/commit/8ba1b81b8))
* **cli:** slightly improved error detail logging ([60ddb1980](https://github.com/garden-io/garden/commit/60ddb1980))
* **commands:** add --skip-detail and --only-deploys flags ([6130c9e14](https://github.com/garden-io/garden/commit/6130c9e14))
* **config:** better debug info for certain schema errors ([fdda5256a](https://github.com/garden-io/garden/commit/fdda5256a))
* **config-store:** tighter file mode on global config + atomic write ([a6df8ffab](https://github.com/garden-io/garden/commit/a6df8ffab))
* **container:** redeploy when spec changes ([2c6f4d468](https://github.com/garden-io/garden/commit/2c6f4d468))
* **container:** slightly more clear log context for docker builds ([6938c4d01](https://github.com/garden-io/garden/commit/6938c4d01))
* **core:** clear separation between input and output versions for tasks ([afc9dcd53](https://github.com/garden-io/garden/commit/afc9dcd53))
* **core:** tell user which envs are configured when bad env specified ([dd00f9625](https://github.com/garden-io/garden/commit/dd00f9625))
* **core:** ensure SIGINT is honored ([2252ceb11](https://github.com/garden-io/garden/commit/2252ceb11))
* **core:** logging tweaks ([411841291](https://github.com/garden-io/garden/commit/411841291))
* **core:** project conf. validation errors ([c6f756cb8](https://github.com/garden-io/garden/commit/c6f756cb8))
* **core:** avoid resolving tree version twice when using modules ([3c2987f06](https://github.com/garden-io/garden/commit/3c2987f06))
* **deploy:** delegate to dev when persistent ([f00a53152](https://github.com/garden-io/garden/commit/f00a53152))
* **dev:** persist command history between dev command sessions ([d8104f220](https://github.com/garden-io/garden/commit/d8104f220))
* **dev:** show spinner while commands are running ([0f6fc7ab1](https://github.com/garden-io/garden/commit/0f6fc7ab1))
* **dev:** autocomplete on right-arrow if at end of input line ([30d8bf18c](https://github.com/garden-io/garden/commit/30d8bf18c))
* **dev:** add 'exit' as alias to 'quit' command ([520ae6f48](https://github.com/garden-io/garden/commit/520ae6f48))
* **dev:** improve intro text and help slightly ([5e7bddee7](https://github.com/garden-io/garden/commit/5e7bddee7))
* **dev:** split --cmd by newlines ([8b7cb1138](https://github.com/garden-io/garden/commit/8b7cb1138))
* **dev:** some styling tweaks in dev command ([f0126074d](https://github.com/garden-io/garden/commit/f0126074d))
* **dev:** handle config changes ([8fb2a3bb3](https://github.com/garden-io/garden/commit/8fb2a3bb3))
* **dev:** better help text & header ([46c8351a3](https://github.com/garden-io/garden/commit/46c8351a3))
* **dev:** warn when exiting with CTRL-C ([d99c02d5f](https://github.com/garden-io/garden/commit/d99c02d5f))
* **dev:** stop syncs when exiting gracefully ([c350b2255](https://github.com/garden-io/garden/commit/c350b2255))
* **dev-mode:** address PR comments ([af53702e3](https://github.com/garden-io/garden/commit/af53702e3))
* **events:** filter on event types we don't need to stream ([043cd56b7](https://github.com/garden-io/garden/commit/043cd56b7))
* **exec:** run persistent exec processes detached from the Garden proc ([aaae3ddd9](https://github.com/garden-io/garden/commit/aaae3ddd9))
* **framework:** allow users to specify proxy hostname in project config ([0d3b2b4d1](https://github.com/garden-io/garden/commit/0d3b2b4d1))
* **hadolint:** update `hadolint` to `v.2.12.0` ([798e8bc46](https://github.com/garden-io/garden/commit/798e8bc46))
* **k8s:** syncs keep running after Garden process exits ([7bbd9c39b](https://github.com/garden-io/garden/commit/7bbd9c39b))
* **k8s:** schedule runners w/o deploying ([3a942ef76](https://github.com/garden-io/garden/commit/3a942ef76))
* **k8s:** catch internal etcdserver throttling error from API ([a7fb651ce](https://github.com/garden-io/garden/commit/a7fb651ce))
* **k8s:** reduce number of k8s API calls during status monitoring ([14d2c3cb1](https://github.com/garden-io/garden/commit/14d2c3cb1))
* **logger:** various fixes to make basic logger render nicer ([df2058c3f](https://github.com/garden-io/garden/commit/df2058c3f))
* **logger:** render timestamp as local time string ([a439361d1](https://github.com/garden-io/garden/commit/a439361d1))
* **logger:** remove fancy logger ([41c5796d8](https://github.com/garden-io/garden/commit/41c5796d8))
* **logger:** add ActionLog (v0) ([d51a787dd](https://github.com/garden-io/garden/commit/d51a787dd))
* **monitors:** allow multiple commands to subscribe to a monitor ([417efa8a3](https://github.com/garden-io/garden/commit/417efa8a3))
* **server:** bump log level to silly on debug line ([03ecb5eb9](https://github.com/garden-io/garden/commit/03ecb5eb9))
* **server:** tone down server logs ([e30027046](https://github.com/garden-io/garden/commit/e30027046))
* **server:** ensure serverReady event has correct type ([0e0e5a663](https://github.com/garden-io/garden/commit/0e0e5a663))
* **server:** prettier / consistent command logs ([6156925cc](https://github.com/garden-io/garden/commit/6156925cc))
* **sync:** wait for first sync to complete (flush) when starting syncs ([13d38a5b8](https://github.com/garden-io/garden/commit/13d38a5b8))
* **sync:** default to all deploys ([c7aa259a7](https://github.com/garden-io/garden/commit/c7aa259a7))
* **sync-mode:** allow Windows paths as sync sources ([1a2e2fb79](https://github.com/garden-io/garden/commit/1a2e2fb79))
* **sync-status:** show all syncs ([#4333](https://github.com/garden-io/garden/issues/4333)) ([30c62fb92](https://github.com/garden-io/garden/commit/30c62fb92))
* **template:** aligned action and runtime kind validation ([d2255676b](https://github.com/garden-io/garden/commit/d2255676b))
* **template:** better error message on missing kind ([dd6dd4d4d](https://github.com/garden-io/garden/commit/dd6dd4d4d))

### Performance Improvements

* **core:** memoize a bunch of schemas to boost startup time ([57f5411fb](https://github.com/garden-io/garden/commit/57f5411fb))
* **core:** cache schemas to reduce load time and speed up tests ([c560204bd](https://github.com/garden-io/garden/commit/c560204bd))
* **core:** memoize frequently accessed Garden methods ([5690b816a](https://github.com/garden-io/garden/commit/5690b816a))
* **dev:** add internal command for getting sync and deploy statuses ([bea613449](https://github.com/garden-io/garden/commit/bea613449))
* **solver:** fix high CPU usage due to unnecessary event data emission ([1b0b6c78f](https://github.com/garden-io/garden/commit/1b0b6c78f))
* **solver:** use events to avoid stack piling up and improve performance ([559b88a5e](https://github.com/garden-io/garden/commit/559b88a5e))
* **vcs:** reduce calls to check for git directory access ([25224dc02](https://github.com/garden-io/garden/commit/25224dc02))
* **vcs:** cut git CLI calls down by approx 60% ([884d3f93a](https://github.com/garden-io/garden/commit/884d3f93a))

### BREAKING CHANGE


The root level `accessModes` field has been removed on
persistentvolumeclaim module type. Use `spec.accessModes` instead.

Previously Garden would just exit silently when running the logs
command and no services were found, either because of bad params or
because the project has no services.

Now we throw an error, exit with code 1, and log a helpful error
message.

This commit removes the 'fancy' logger.

That is, the default Garden logger that renders spinners and updates log
lines in place.

From now on, the logger previously knowns as the "basic" logger is the
default.

This results in the following breaking changes:

- You can no longer set the logger type to 'fancy' via the `--logger-type`
  flag or the `GARDEN_LOGGER_TYPE` env  var. Note that `"fancy"` was the
  default behaviour so it's very unlikely that it's set anywhere via either
  of the aforementioned options.

Furthermore, setting the logger type to `"basic"` has been deprecated and
will be removed in a future release. Instead the type can be set to
`"default"` (which is kind of a superfluous option).

Furthermore, the logs rendered in the terminal will "look" different
compared to the current default, although that's not technically a
breaking change.

Finally, the shape of the log data sent to Garden Cloud has changed and
will need to be handled specifically in Cloud.

Goodbye, you beautiful disaster.

The `garden test` command now accepts Test action names (including globs) as
positional arguments, instead of module names. To filter tests by module, use
the new `--module` option flag.

The `dotIgnoreFiles` field in project configs has been deprecated in 0.13 in favor of the `dotIgnoreFile` field, and as of 0.13 only one filename is allowed here.

If a single filename is specified in the old `dotIgnoreFiles` field, the conversion is done automatically. If multiple filenames are provided, an error will be thrown.

<a name="0.12.51"></a>
## [0.12.51](https://github.com/garden-io/garden/compare/0.12.50...0.12.51) (2023-02-06)

### Bug Fixes

* **terraform:** improve init behaviour on validate and error messages ([#3663](https://github.com/garden-io/garden/issues/3663)) ([3901d2afc](https://github.com/garden-io/garden/commit/3901d2afc))

### Improvements

* **framework:** allow users to specify proxy hostname in project config ([dd50be4ee](https://github.com/garden-io/garden/commit/dd50be4ee))

<a name="0.12.50"></a>
## [0.12.50](https://github.com/garden-io/garden/compare/0.12.49...0.12.50) (2023-02-01)

### Bug Fixes

* **logs:** ensure invalid dates are handled properly ([e0c4420fc](https://github.com/garden-io/garden/commit/e0c4420fc))

<a name="0.12.49"></a>
## [0.12.49](https://github.com/garden-io/garden/compare/0.12.48...0.12.49) (2023-01-31)

### Bug Fixes

* **terraform:** update condition to trigger terraform init ([#3632](https://github.com/garden-io/garden/issues/3632)) ([ac5fbf4a9](https://github.com/garden-io/garden/commit/ac5fbf4a9))
* **terraform:** fix checksums for terraform 1.2.9 darwin builds ([#3630](https://github.com/garden-io/garden/issues/3630)) ([21ea30f42](https://github.com/garden-io/garden/commit/21ea30f42))
* **exec:** more informative error msg on timeout ([#3584](https://github.com/garden-io/garden/issues/3584)) ([0808531db](https://github.com/garden-io/garden/commit/0808531db))
* **kubernetes:** detect that pod has been killed ([#3571](https://github.com/garden-io/garden/issues/3571)) ([9193a857d](https://github.com/garden-io/garden/commit/9193a857d))
* **framework:** increase consistency in verbose plugin logs ([236987d52](https://github.com/garden-io/garden/commit/236987d52))
* **helm:** stream logs to CLI and Garden Cloud ([#3582](https://github.com/garden-io/garden/issues/3582)) ([22d46a497](https://github.com/garden-io/garden/commit/22d46a497))
* **framework** re-initialize providers changing environments ([#3481](https://github.com/garden-io/garden/issues/3481)) ([02903809f](https://github.com/garden-io/garden/commit/02903809f))
* **cli:** failure in self-update command due to GitHub API change ([99fcd90c7](https://github.com/garden-io/garden/commit/99fcd90c7))
* **events:** use ISO format date strings in event payload ([#3618](https://github.com/garden-io/garden/issues/3618)) ([42a76f339](https://github.com/garden-io/garden/commit/42a76f339))
* **events:** update log event timestamp type be string or number ([4241e4523](https://github.com/garden-io/garden/commit/4241e4523))
* **framework:** omit detail property of errors ([24f32fad3](https://github.com/garden-io/garden/commit/24f32fad3))
* **kubernetes:** make preStop command work with busybox ([#3568](https://github.com/garden-io/garden/issues/3568)) ([b062281a0](https://github.com/garden-io/garden/commit/b062281a0))
* **scripts:** release.ts unintentionally also ran scripts ([#3626](https://github.com/garden-io/garden/issues/3626)) ([e7024fe63](https://github.com/garden-io/garden/commit/e7024fe63))

### Features

* **remote sources:** allow to specify commit for remote sources ([78ddb509e](https://github.com/garden-io/garden/commit/78ddb509e))
* **commands:** add experimental watch disable flag for dev mode ([2d8bf03e5](https://github.com/garden-io/garden/commit/2d8bf03e5))
* **kubernetes:** add sync helper commands ([e2a084af0](https://github.com/garden-io/garden/commit/e2a084af0))

### Improvements

* **cli:** trim binary size by approx 1/3 ([ee3554eb0](https://github.com/garden-io/garden/commit/ee3554eb0))
* **examples:** add a rust example ([#3503](https://github.com/garden-io/garden/issues/3503)) ([e04324ad6](https://github.com/garden-io/garden/commit/e04324ad6))
* **helm:** relax path validation requirements for valueFiles ([#3445](https://github.com/garden-io/garden/issues/3445)) ([24589b62c](https://github.com/garden-io/garden/commit/24589b62c))
* **server:** ensure serverReady event has correct type ([81350c768](https://github.com/garden-io/garden/commit/81350c768))
* **cloud:** automate remote project creation ([#3462](https://github.com/garden-io/garden/issues/3462)) ([f8f2cf706](https://github.com/garden-io/garden/commit/f8f2cf706))

<a name="0.12.48"></a>
## [0.12.48](https://github.com/garden-io/garden/compare/0.12.47...0.12.48) (2022-12-16)

### Bug Fixes

* send a periodic ping over the websocket for exec ([#3395](https://github.com/garden-io/garden/issues/3395)) ([f716084a1](https://github.com/garden-io/garden/commit/f716084a1))
* kubernetes endpoints over plain http ([2f499107e](https://github.com/garden-io/garden/commit/2f499107e))
* **dev-mode:** proper support of absolute source paths ([e9b043fa7](https://github.com/garden-io/garden/commit/e9b043fa7))
* **k8s:** fix error detail format in `PodRunner.exec()` ([#3430](https://github.com/garden-io/garden/issues/3430)) ([cd2711794](https://github.com/garden-io/garden/commit/cd2711794))
* **k8s:** fixed error handling in image builders ([8741c87ed](https://github.com/garden-io/garden/commit/8741c87ed))
* **k8s:** support local builds in microk8s in multipass ([#3423](https://github.com/garden-io/garden/issues/3423)) ([a0a4fdefe](https://github.com/garden-io/garden/commit/a0a4fdefe))
* **logger:** always show sections with basic logger ([476d7bf56](https://github.com/garden-io/garden/commit/476d7bf56))
* **server:** send better close codes on ws connection close ([b641ae1ce](https://github.com/garden-io/garden/commit/b641ae1ce))

### Improvements

* decoupled the cloud api login from project configuration and verification ([#3413](https://github.com/garden-io/garden/issues/3413)) ([5ceb762d2](https://github.com/garden-io/garden/commit/5ceb762d2))
* **jib:** configurable gradle binary ([871a3ff7f](https://github.com/garden-io/garden/commit/871a3ff7f))
* **k8s:** better error handling and logging in `PodRunner` ([#3388](https://github.com/garden-io/garden/issues/3388)) ([36ea78430](https://github.com/garden-io/garden/commit/36ea78430))

<a name="0.12.47"></a>
## [0.12.47](https://github.com/garden-io/garden/compare/0.12.46...0.12.47) (2022-12-02)

## Important note

The `dns-lookup-cache` library usage was removed in the following commit:
* chore: remove dns-lookup-cache ([#3389](https://github.com/garden-io/garden/issues/3389)) ([352440189](https://github.com/garden-io/garden/commit/352440189))

**This may affect Rancher users.**
If you get any troubles with Rancher, please submit a [GitHub issue](https://github.com/garden-io/garden/issues/new/choose).

### Bug Fixes

* do not log failed log connection attempt ([58a1ae7c8](https://github.com/garden-io/garden/commit/58a1ae7c8))
* initiate global-agent only when needed ([737c6c444](https://github.com/garden-io/garden/commit/737c6c444))
* **cloud:** fix duplicate event emission ([6aac57ff7](https://github.com/garden-io/garden/commit/6aac57ff7))
* **container:** autoResolveIncludes with multi-stage dockerfiles ([328d3e9ef](https://github.com/garden-io/garden/commit/328d3e9ef))
* **docker:** handle unknown Dockerfile flags ([#3359](https://github.com/garden-io/garden/issues/3359)) ([6118ff394](https://github.com/garden-io/garden/commit/6118ff394))
* **framework:** idempotent config store deletes ([98d34ad06](https://github.com/garden-io/garden/commit/98d34ad06))
* **k8s:** make getRolloutStatus work with 0 replicas ([66f74e8be](https://github.com/garden-io/garden/commit/66f74e8be))
* **k8s:** update ecr-cred-helper for imdsv2 support ([#3380](https://github.com/garden-io/garden/issues/3380)) ([7759cb1b0](https://github.com/garden-io/garden/commit/7759cb1b0))
* **k8s:** add preStop command for rsync containers ([#3329](https://github.com/garden-io/garden/issues/3329)) ([7e86f3eae](https://github.com/garden-io/garden/commit/7e86f3eae))
* **logger:** fix issues with spinner and duplicated entries ([9e9be6956](https://github.com/garden-io/garden/commit/9e9be6956))
* **logger:** ensure fancy logger doesn't erease new entries ([a5717d542](https://github.com/garden-io/garden/commit/a5717d542))
* **plugins:** fixed `stern` repo link and updated version ([78e7c2ffc](https://github.com/garden-io/garden/commit/78e7c2ffc))
* **template:** fixed loop context caching in `forEach` helper ([#3350](https://github.com/garden-io/garden/issues/3350)) ([1393e0850](https://github.com/garden-io/garden/commit/1393e0850))

### Features

* allow separate tolerations on garden-util pod ([df391165e](https://github.com/garden-io/garden/commit/df391165e))
* separate resource config for util pods ([a8c2f42df](https://github.com/garden-io/garden/commit/a8c2f42df))
* allow to set no resource limits ([#3352](https://github.com/garden-io/garden/issues/3352)) ([640ec4699](https://github.com/garden-io/garden/commit/640ec4699))
* **jib:** add maven daemon support as project build type ([#3361](https://github.com/garden-io/garden/issues/3361)) ([bcbc7e353](https://github.com/garden-io/garden/commit/bcbc7e353))
* **k8s:** custom nodeSelector for util pods ([#3391](https://github.com/garden-io/garden/issues/3391)) ([bdbe5bd94](https://github.com/garden-io/garden/commit/bdbe5bd94))
* **k8s:** custom annotations for builder pods ([#3365](https://github.com/garden-io/garden/issues/3365)) ([0a35ead5d](https://github.com/garden-io/garden/commit/0a35ead5d))

### Improvements

* retry mutagen session flush ([e9cde8827](https://github.com/garden-io/garden/commit/e9cde8827))
* **k8s:** bump buildkit image to v0.10.5 ([#3336](https://github.com/garden-io/garden/issues/3336)) ([9080edb36](https://github.com/garden-io/garden/commit/9080edb36))
* **plugins:** supported darwin arm64 `stern` binaries ([492aaceab](https://github.com/garden-io/garden/commit/492aaceab))
* **pulumi:** upgrade pulumi version to 3.48.0 ([#3400](https://github.com/garden-io/garden/issues/3400)) ([77aff5e3b](https://github.com/garden-io/garden/commit/77aff5e3b))

<a name="0.12.46"></a>
## [0.12.46](https://github.com/garden-io/garden/compare/0.12.45...0.12.46) (2022-10-21)

### Bug Fixes

* fixed `parallel` flag impl in `update-remote sources` command ([ef3a993ba](https://github.com/garden-io/garden/commit/ef3a993ba))
* **cli:** fixed alias of `--skip-dependencies` flag in garden commands ([7a329fd74](https://github.com/garden-io/garden/commit/7a329fd74))
* **cloud:** quick fix the "cloud create user" command ([2a4a631a0](https://github.com/garden-io/garden/commit/2a4a631a0))
* **k8s:** use mode=inline for buildkit in-cluster builder as default ([#3312](https://github.com/garden-io/garden/issues/3312)) ([4850aa9f7](https://github.com/garden-io/garden/commit/4850aa9f7))
* **local-mode:** disabled startup probes for proxy container ([aa5b50e46](https://github.com/garden-io/garden/commit/aa5b50e46))
* **local-mode:** fixed some bugs in local mode config ([#3311](https://github.com/garden-io/garden/issues/3311)) ([ee97935a4](https://github.com/garden-io/garden/commit/ee97935a4))
* **pulumi:** use correct template context ([47300cdc9](https://github.com/garden-io/garden/commit/47300cdc9))
* **server:** terminate ws connection if server not ready ([6dc50d233](https://github.com/garden-io/garden/commit/6dc50d233))
* **template:** support numeric indices in `slice` function ([9685a1414](https://github.com/garden-io/garden/commit/9685a1414))

### Features

* **core:** allow adding tolerations to buildkit deployment ([60aa32110](https://github.com/garden-io/garden/commit/60aa32110))
* **exec:** live log streaming for exec modules ([bbe493b16](https://github.com/garden-io/garden/commit/bbe493b16))
* **pulumi:** add --skip-dependencies CLI option ([6d87f3cdd](https://github.com/garden-io/garden/commit/6d87f3cdd))

### Improvements

* **cli:** improve header/footer text when connected to Cloud ([2131a4569](https://github.com/garden-io/garden/commit/2131a4569))
* **container:** configurable deployment strategy  ([#3293](https://github.com/garden-io/garden/issues/3293)) ([f6e7cfd10](https://github.com/garden-io/garden/commit/f6e7cfd10))
* **logs:** run and test commands error handling ([#3309](https://github.com/garden-io/garden/issues/3309)) ([00402e62f](https://github.com/garden-io/garden/commit/00402e62f))
* **pulumi:** better preview summaries ([977877ebf](https://github.com/garden-io/garden/commit/977877ebf))
* **pulumi:** handle build deps ([3137e0ccf](https://github.com/garden-io/garden/commit/3137e0ccf))
* **pulumi:** improve preview output ([5d96b7c8a](https://github.com/garden-io/garden/commit/5d96b7c8a))
* **pulumi:** stricter validation and better error messages ([8995b1e8e](https://github.com/garden-io/garden/commit/8995b1e8e))
* **template:** string concatenation with `concat` function ([97631f6f7](https://github.com/garden-io/garden/commit/97631f6f7))
* **template:** support string concatenation with `+` operator ([164da6668](https://github.com/garden-io/garden/commit/164da6668))
* **template:** allow empty string separator in `join` function ([987c211d4](https://github.com/garden-io/garden/commit/987c211d4))
* **terraform:** stricter validation and better error messages ([351bfb855](https://github.com/garden-io/garden/commit/351bfb855))

<a name="0.12.45"></a>
## [0.12.45](https://github.com/garden-io/garden/compare/0.12.44...0.12.45) (2022-09-29)

### BREAKING CHANGES

* check for requirements being installed ([#3097](https://github.com/garden-io/garden/issues/3097)) ([63628b13b](https://github.com/garden-io/garden/commit/63628b13b))
* **local-mode:** allow multiple port-forwards ([a98af5363](https://github.com/garden-io/garden/commit/a98af5363))
* **terraform:** upgraded default terraform tool version to `1.2.9` ([#3220](https://github.com/garden-io/garden/issues/3220)) ([8f6a3be44](https://github.com/garden-io/garden/commit/8f6a3be44))
* rename `master` to `main` ([935eecff6](https://github.com/garden-io/garden/commit/935eecff6)) - On Mac machines, `brew update` command may fail with an error. To fix this, just run the suggested command `brew tap --repair` and re-run `brew update`.

### Bug Fixes

* subcommand help listing ([#3261](https://github.com/garden-io/garden/issues/3261)) ([5e9593440](https://github.com/garden-io/garden/commit/5e9593440))
* ensure semver format in git/rsync version regex ([81cb0f98f](https://github.com/garden-io/garden/commit/81cb0f98f))
* make copy target actually default to source ([#3223](https://github.com/garden-io/garden/issues/3223)) ([b8960204c](https://github.com/garden-io/garden/commit/b8960204c))
* **docs:** fixed template strings rendering in docs generator ([7bc1e602a](https://github.com/garden-io/garden/commit/7bc1e602a))
* **cli:** run exec commands from proj root ([5d0cd005c](https://github.com/garden-io/garden/commit/5d0cd005c))
* **core:** fix Rosetta detection logic for OSX ([ff96b2ff1](https://github.com/garden-io/garden/commit/ff96b2ff1))
* **core:** fixed concurrency issue with plugin tool downloads ([1c65ac7f5](https://github.com/garden-io/garden/commit/1c65ac7f5))

### Features

* add option to run git pulls in parallel ([5554a3dc8](https://github.com/garden-io/garden/commit/5554a3dc8))
* allow module overlap if one or both of them are disabled ([#3222](https://github.com/garden-io/garden/issues/3222)) ([b97678999](https://github.com/garden-io/garden/commit/b97678999))
* use M1 native tools where available ([#3185](https://github.com/garden-io/garden/pull/3185))
* **k8s:** simple `mode=max` support with a list of not supported registries ([#3239](https://github.com/garden-io/garden/pull/3239))

### Improvements

* more precise error handling in binary tool version checker ([c102ebae9](https://github.com/garden-io/garden/commit/c102ebae9))
* check for requirements being installed ([#3097](https://github.com/garden-io/garden/issues/3097)) ([63628b13b](https://github.com/garden-io/garden/commit/63628b13b))
* **dev-mode:** allow non-subpaths for dev-mode sync ([2f71ce5d2](https://github.com/garden-io/garden/commit/2f71ce5d2)) and ([83de16e6](https://github.com/garden-io/garden/commit/83de16e6))
* **jib:** stricter validation and better error messages ([203ef357a](https://github.com/garden-io/garden/commit/203ef357a))
* **jib:** updated LTS JDKs (8 and 11) to the latest releases ([75ed16436](https://github.com/garden-io/garden/commit/75ed16436))
* **jib:** supported JDK 17 LTS version ([3f3c91f31](https://github.com/garden-io/garden/commit/3f3c91f31))
* **jib:** supported OpenJDK 13 ([12ffec527](https://github.com/garden-io/garden/commit/12ffec527))
* **jib:** configurable JDK path ([3fa1fe45b](https://github.com/garden-io/garden/commit/3fa1fe45b))
* **jib:** upgraded Gradle version to `7.5.1` ([6a6504e1d](https://github.com/garden-io/garden/commit/6a6504e1d))
* **jib:** upgraded Maven version to `3.8.5` ([84bcb67b2](https://github.com/garden-io/garden/commit/84bcb67b2))
* **jib:** configurable Maven binary ([dd8396c08](https://github.com/garden-io/garden/commit/dd8396c08))
* **jib:** configurable Maven phases in jib modules ([e0b6d0814](https://github.com/garden-io/garden/commit/e0b6d0814))
* **local-mode:** allow multiple port-forwards ([a98af5363](https://github.com/garden-io/garden/commit/a98af5363))
* **terraform:** upgraded default terraform tool version to `1.2.9` ([#3220](https://github.com/garden-io/garden/issues/3220)) ([8f6a3be44](https://github.com/garden-io/garden/commit/8f6a3be44))

<a name="0.12.44"></a>
## [0.12.44](https://github.com/garden-io/garden/compare/0.12.43...0.12.44) (2022-08-03)

### Bug Fixes

* support `--dependants-first` option in `delete service` command ([7ce03030d](https://github.com/garden-io/garden/commit/7ce03030d))
* **docs:** fixed multi-char aliases in commands' descriptions ([51ab495af](https://github.com/garden-io/garden/commit/51ab495af))
* **k8s:** missing logs in some scenarios when tests/tasks with artifacts fail ([a21103212](https://github.com/garden-io/garden/commit/a21103212))

### Features

* added `local.arch` template variable ([f213c8675](https://github.com/garden-io/garden/commit/f213c8675))
* **config:** add concat helper function ([f3a2e29d2](https://github.com/garden-io/garden/commit/f3a2e29d2))
* **config:** support array literals in template strings ([1d119557c](https://github.com/garden-io/garden/commit/1d119557c))

### Improvements

* used async sleeps between retries in recoverable process ([efd6e73bd](https://github.com/garden-io/garden/commit/efd6e73bd))
* **local-mode:** don't watch files in local-mode modules ([11f6d146a](https://github.com/garden-io/garden/commit/11f6d146a))

<a name="0.12.43"></a>
## [0.12.43](https://github.com/garden-io/garden/compare/0.12.42...0.12.43) (2022-07-14)

### Bug Fixes

* include stderr for outputs from commands returning an artifact ([#3043](https://github.com/garden-io/garden/issues/3043)) ([f04a5624b](https://github.com/garden-io/garden/commit/f04a5624b))
* **cli:** bad error message when dependency fails in run task/test cmd ([894d7f765](https://github.com/garden-io/garden/commit/894d7f765))
* **cloud:** handle "=" separator in named vars passed as command args ([7ff078a58](https://github.com/garden-io/garden/commit/7ff078a58))
* **core:** resolve runtime values in test configs ([4da5b03e5](https://github.com/garden-io/garden/commit/4da5b03e5))

### Features

* add get workflows command ([#3030](https://github.com/garden-io/garden/issues/3030)) ([0f42478b4](https://github.com/garden-io/garden/commit/0f42478b4))
* **core:** opt for deleting services in dep order ([267eac9fb](https://github.com/garden-io/garden/commit/267eac9fb))
* **k8s:** local mode for helm modules ([#3033](https://github.com/garden-io/garden/issues/3033)) ([a7722b58e](https://github.com/garden-io/garden/commit/a7722b58e))
* **k8s:** local mode for kubernetes modules ([f44ff3979](https://github.com/garden-io/garden/commit/f44ff3979))

### Improvements

* add warning if project id but not logged in to cloud ([9d431cb8f](https://github.com/garden-io/garden/commit/9d431cb8f))
* add more context for kubeconfig err ([#3022](https://github.com/garden-io/garden/issues/3022)) ([1efa7429b](https://github.com/garden-io/garden/commit/1efa7429b))
* minor improvements in core/cloud interactivity ([7cedc25d2](https://github.com/garden-io/garden/commit/7cedc25d2))
* **k8s:** verbose logging of the local app output in local mode ([6450936f8](https://github.com/garden-io/garden/commit/6450936f8))

<a name="0.12.42"></a>
## [0.12.42](https://github.com/garden-io/garden/compare/0.12.41...0.12.42) (2022-06-21)

### Bug Fixes

* consider all garden projects as safe git repos ([1e2974fa9](https://github.com/garden-io/garden/commit/1e2974fa9))
* update nginx ingress controller for kind ([#3005](https://github.com/garden-io/garden/issues/3005)) ([82a73b200](https://github.com/garden-io/garden/commit/82a73b200))
* allow garden helm plugin to install crds ([3b6996846](https://github.com/garden-io/garden/commit/3b6996846))
* handle unknown cloud profile ([#2994](https://github.com/garden-io/garden/issues/2994)) ([1e5707e18](https://github.com/garden-io/garden/commit/1e5707e18))
* **core:** corrected git `safe.directory` paths for windows ([99d85951d](https://github.com/garden-io/garden/commit/99d85951d))
* **k8s:** copy imagePullSecrets to builder pods ([1bcdf7a46](https://github.com/garden-io/garden/commit/1bcdf7a46))

### Features

* core-cloud interactivity ([232b55793](https://github.com/garden-io/garden/commit/232b55793))
* **cli:** --full option for get modules command ([4a17b0405](https://github.com/garden-io/garden/commit/4a17b0405))
* **k8s:** local mode for container modules ([#2949](https://github.com/garden-io/garden/issues/2949)) ([f9cad6c40](https://github.com/garden-io/garden/commit/f9cad6c40))

### Improvements

* optimized safety checks for git repos ([33ab184fa](https://github.com/garden-io/garden/commit/33ab184fa)) and ([df07657c6](https://github.com/garden-io/garden/commit/df07657c6))
* bump alpine, node and gcloud SDK version in support ([#3013](https://github.com/garden-io/garden/issues/3013)) ([baf4d79d8](https://github.com/garden-io/garden/commit/baf4d79d8))
* update bundled Docker to 20.10.9
* **k8s:** change kaniko default image to 1.8.1 ([#3007](https://github.com/garden-io/garden/issues/3007)) ([cdf5695b7](https://github.com/garden-io/garden/commit/cdf5695b7))

<a name="0.12.41"></a>
## [0.12.41](https://github.com/garden-io/garden/compare/0.12.40...0.12.41) (2022-05-24)

### Bug Fixes

* increased num of retries and timeouts for rsync ([b404bb77b](https://github.com/garden-io/garden/commit/b404bb77b))
* transitive dependency handling ([#2937](https://github.com/garden-io/garden/issues/2937)) ([d94c83b83](https://github.com/garden-io/garden/commit/d94c83b83))
* workflows fail silently and --output doesn't work ([eb7f7b29c](https://github.com/garden-io/garden/commit/eb7f7b29c))
* git repo ownership issue ([e4219a779](https://github.com/garden-io/garden/commit/e4219a779))
* add nginx ingressClass resource for microk8s ([51df08193](https://github.com/garden-io/garden/commit/51df08193))
* **cli:** potential OOM error during module and error serialization ([02cacf63e](https://github.com/garden-io/garden/commit/02cacf63e))
* **cli:** typo in field filtering in scan command ([59e0fcd01](https://github.com/garden-io/garden/commit/59e0fcd01))
* **cloud:** fix duplicate footer on config change ([9b83e522c](https://github.com/garden-io/garden/commit/9b83e522c))
* **container:** fix unneeded redeploys in dev mode ([b5be2e629](https://github.com/garden-io/garden/commit/b5be2e629))
* **core:** fix git submodules usage ([bdbc36672](https://github.com/garden-io/garden/commit/bdbc36672))
* **core:** improve ingress warning ([e0b3cb0e5](https://github.com/garden-io/garden/commit/e0b3cb0e5))
* **core:** avoid type error when active request not found ([caf3b4653](https://github.com/garden-io/garden/commit/caf3b4653))
* **core:** infinite loop in module resolution (related to perf improvements) ([f52a166f7](https://github.com/garden-io/garden/commit/f52a166f7))
* **core:** slow graph resolution for large (100+ modules) projects ([ecaaa2e86](https://github.com/garden-io/garden/commit/ecaaa2e86))
* **core:** don't use expensive circular dependency detection unless needed ([025c9298e](https://github.com/garden-io/garden/commit/025c9298e))
* **docs:** re-generated docs ([4ea2a7bb2](https://github.com/garden-io/garden/commit/4ea2a7bb2))
* **jib:** fixed jib module's include config ([284df0d75](https://github.com/garden-io/garden/commit/284df0d75))
* **k8s:** avoid unnecessary namespace patch no-op on init ([c57cf77d9](https://github.com/garden-io/garden/commit/c57cf77d9))
* **plugins:** deploy an ingressclass resource if using microk8s ([e5a535604](https://github.com/garden-io/garden/commit/e5a535604))

### Features

* pulumi plugin ([9f6393970](https://github.com/garden-io/garden/commit/9f6393970))
* expose TTY setting on container modules ([5c17c6022](https://github.com/garden-io/garden/commit/5c17c6022))
* analytics with cloud user metadata ([#2943](https://github.com/garden-io/garden/issues/2943)) ([edd654423](https://github.com/garden-io/garden/commit/edd654423))
* **plugins:** add a warn if suitable ingressclass is not found ([adb00f1f5](https://github.com/garden-io/garden/commit/adb00f1f5))

### Improvements

* **cli:** minor logging additions ([0c04355e2](https://github.com/garden-io/garden/commit/0c04355e2))
* **cli:** better stack traces for error reports, with source mapping ([615d8d012](https://github.com/garden-io/garden/commit/615d8d012))
* **core:** reduce unnecessary computation during config resolution ([c500d3b00](https://github.com/garden-io/garden/commit/c500d3b00))
* **core:** more efficient module resolution ([4b31adced](https://github.com/garden-io/garden/commit/4b31adced)) and ([61d9b85ed](https://github.com/garden-io/garden/commit/61d9b85ed))
* **core:** add --skip flag to test command ([6c046e8ce](https://github.com/garden-io/garden/commit/6c046e8ce))

### Performance Improvements

* **core:** reduce unnecessary I/O to resolve build paths ([e2803cfba](https://github.com/garden-io/garden/commit/e2803cfba))

<a name="0.12.40"></a>
## [0.12.40](https://github.com/garden-io/garden/compare/0.12.39...0.12.40) (2022-04-26)

### Bug Fixes

* **cli:** sporadic fsevents error on mac machines ([c5fcc672](https://github.com/garden-io/garden/commit/c5fcc672))
* **core:** attempt to fix unhandled promise rejection from got ([8aa4bc1c](https://github.com/garden-io/garden/commit/8aa4bc1c))
* **docs:** fixed broken links ([014bfb65](https://github.com/garden-io/garden/commit/014bfb65))

### Features

* add skip-comments option to cli create command ([2e0f20c9](https://github.com/garden-io/garden/commit/2e0f20c9))

<a name="0.12.39"></a>
## [0.12.39](https://github.com/garden-io/garden/compare/0.12.38...0.12.39) (2022-04-08)

### Bug Fixes

* add default ingress class for nginx ingress controller ([31b0773f](https://github.com/garden-io/garden/commit/31b0773f))
* **cli:** avoid unnecessary git scan at startup ([5eeea39c](https://github.com/garden-io/garden/commit/5eeea39c))
* **cli:** uncaught promise error when version check fails ([6cf6ed65](https://github.com/garden-io/garden/commit/6cf6ed65))
* **core:** require auth key for server endpoints ([56051a5b](https://github.com/garden-io/garden/commit/56051a5b))
* **core:** always show dashboard link ([64dd9b86](https://github.com/garden-io/garden/commit/64dd9b86))
* **k8s:** handle spaces in kubectl path provided to Mutagen ([2045cf41](https://github.com/garden-io/garden/commit/2045cf41))
* **template:** error in && operator during partial initial resolution ([8a8215de](https://github.com/garden-io/garden/commit/8a8215de))

### Features

* **k8s:** allow overriding kubectl path in provider config ([233c5a1b](https://github.com/garden-io/garden/commit/233c5a1b))

### Improvements

* **cloud:** print link to Cloud namespace if applicable ([dac340b8](https://github.com/garden-io/garden/commit/dac340b8))

<a name="0.12.38"></a>
## [0.12.38](https://github.com/garden-io/garden/compare/0.12.37...0.12.38) (2022-03-28)

### Bug Fixes

* **cli:** error when starting file watching on macOS ([0ef33fbe](https://github.com/garden-io/garden/commit/0ef33fbe))
* **core:** fix EADDRNOTAVAIL error in watch mode ([07989820](https://github.com/garden-io/garden/commit/07989820))

<a name="0.12.37"></a>
## [0.12.37](https://github.com/garden-io/garden/compare/0.12.36...0.12.37) (2022-03-18)

### Bug Fixes

* fix maven download for windows ([7686eade](https://github.com/garden-io/garden/commit/7686eade))
* **docs:** fix broken anchor link ([9b6f264e](https://github.com/garden-io/garden/commit/9b6f264e))
* **examples:** updated golang version in examples ([241118e6](https://github.com/garden-io/garden/commit/241118e6))
* **exec:** properly handle empty lines in local service logs ([5147f60e](https://github.com/garden-io/garden/commit/5147f60e))
* **k8s:** escape spaces in local mutagen dests ([f100d1d2](https://github.com/garden-io/garden/commit/f100d1d2))

### Features

* **template:** add 'string' template function ([6b96296c](https://github.com/garden-io/garden/commit/6b96296c))

<a name="0.12.36"></a>
## [0.12.36](https://github.com/garden-io/garden/compare/0.12.35...0.12.36) (2022-03-15)

### Bug Fixes

* **cli:** allow running garden CLI in custom Command `exec` field ([6c8577a8](https://github.com/garden-io/garden/commit/6c8577a8))
* **core:** treat null/false as undefined for container image field ([65e7f7f8](https://github.com/garden-io/garden/commit/65e7f7f8))
* **core:** add missing await for user prompt ([0696fb4f](https://github.com/garden-io/garden/commit/0696fb4f))
* **core:** fix infinite recursion that could cause OOM error ([c1c6c896](https://github.com/garden-io/garden/commit/c1c6c896))
* **exec:** ensure we stream error log entries ([08b98ca1](https://github.com/garden-io/garden/commit/08b98ca1))
* **k8s:** sync error with space in user home directory name ([7f55c31b](https://github.com/garden-io/garden/commit/7f55c31b))
* **scripts:** fixed deps installation script ([f902f404](https://github.com/garden-io/garden/commit/f902f404))

### Features

* **core:** support persistent local processes ([40c21a00](https://github.com/garden-io/garden/commit/40c21a00))
* **core:** add template string sha256 function ([ae49bd7b](https://github.com/garden-io/garden/commit/ae49bd7b))

### Improvements

* **k8s:** bump BuildKit version to 0.9.3 ([34ef856c](https://github.com/garden-io/garden/commit/34ef856c))

<a name="0.12.35"></a>
## [0.12.35](https://github.com/garden-io/garden/compare/0.12.34...0.12.35) (2022-01-26)

### Bug Fixes

* updated brew command in dependency install script ([5847f09b](https://github.com/garden-io/garden/commit/5847f09b))
* **cli:** potential OOM error for large projects ([0ecd7410](https://github.com/garden-io/garden/commit/0ecd7410))
* **core:** ignore trailing slashes in project config domains ([7cfa4fb0](https://github.com/garden-io/garden/commit/7cfa4fb0))
* **k8s:** handle specific error case in log streaming ([5dd1c34e](https://github.com/garden-io/garden/commit/5dd1c34e))
* **k8s:** use namespace from module when port forwarding ([c99f8e92](https://github.com/garden-io/garden/commit/c99f8e92))
* **k8s:** use correct Mutagen termination command ([c644ef49](https://github.com/garden-io/garden/commit/c644ef49))
* **template:** allow missing keys in AND (&&) conditionals ([7bf19540](https://github.com/garden-io/garden/commit/7bf19540))
* **template:** don't fail validation on partially resolved helper calls ([f03579e7](https://github.com/garden-io/garden/commit/f03579e7))

### Code Refactoring

* **k8s:** use environment variable to prevent Mutagen autostart ([1efcf3bb](https://github.com/garden-io/garden/commit/1efcf3bb))

### Features

* **cli:** custom commands ([4e7c741a](https://github.com/garden-io/garden/commit/4e7c741a))
* **core:** debug logfiles ([ebff37a7](https://github.com/garden-io/garden/commit/ebff37a7))
* **core:** --with-dependants option for build cmd ([c3fbbbe6](https://github.com/garden-io/garden/commit/c3fbbbe6))
* **k8s:** support kustomize on kubernetes modules ([e954f72c](https://github.com/garden-io/garden/commit/e954f72c))
* **template:** add join helper function, to convert an array to string ([3c02abb6](https://github.com/garden-io/garden/commit/3c02abb6))

### Improvements

* **cloud:** handle AEC for Helm services ([3326c3c5](https://github.com/garden-io/garden/commit/3326c3c5))
* **core:** evaluate null|false as undefined for dockerfile field ([4f43eb6b](https://github.com/garden-io/garden/commit/4f43eb6b))
* **core:** better workflow error logging ([0415fb7b](https://github.com/garden-io/garden/commit/0415fb7b))
* **examples:** update ingress specs in example garden projects ([423da252](https://github.com/garden-io/garden/commit/423da252))

### Performance Improvements

* **core:** faster hashing and test speed improvements ([7f6a7600](https://github.com/garden-io/garden/commit/7f6a7600))

<a name="0.12.34"></a>
## [0.12.34](https://github.com/garden-io/garden/compare/0.12.33...0.12.34) (2022-01-04)

### Bug Fixes

* **cli:** get rid of EPIPE error and OOM check ([f950755b](https://github.com/garden-io/garden/commit/f950755b))
* **core:** properly handle sparse build deps ([2fb8a119](https://github.com/garden-io/garden/commit/2fb8a119))
* **docs:** fix a typo in the how garden works doc ([fdc2e0d4](https://github.com/garden-io/garden/commit/fdc2e0d4))
* **docs:** fix a typo in the using-garden-in-ci doc ([4ec4280b](https://github.com/garden-io/garden/commit/4ec4280b))
* **docs:** fix typos in the in-cluster building doc ([1fe693a9](https://github.com/garden-io/garden/commit/1fe693a9))
* **docs:** fix a typo in the hot-reload doc ([d27b3672](https://github.com/garden-io/garden/commit/d27b3672))
* **docs:** fix typos in the dontainer modules doc ([fdd68352](https://github.com/garden-io/garden/commit/fdd68352))
* **docs:** fix typos in the code sync dev doc ([b110866c](https://github.com/garden-io/garden/commit/b110866c))
* **docs:** fix a typo in the project init doc ([7b60d45e](https://github.com/garden-io/garden/commit/7b60d45e))
* **docs:** fix a typo in the stack-graph.md doc ([474301d9](https://github.com/garden-io/garden/commit/474301d9))
* **docs:** fix a typo in welcome.md docs ([ad1af886](https://github.com/garden-io/garden/commit/ad1af886))
* **k8s:** better handling for long log lines ([cc0ad52a](https://github.com/garden-io/garden/commit/cc0ad52a))
* **k8s:** fix rollout status check for Recreate ([bcd2df2d](https://github.com/garden-io/garden/commit/bcd2df2d))
* **k8s:** fix issues with mutagen symlink directory ([7c57b69c](https://github.com/garden-io/garden/commit/7c57b69c))
* **k8s:** allow any style of path for kubeconfig field ([6e6d4c45](https://github.com/garden-io/garden/commit/6e6d4c45))
* **template:** template string in helper arguments weren't resolved ([0157fe0d](https://github.com/garden-io/garden/commit/0157fe0d))

### Features

* **config:** add ${datetime.*} template context ([78cd007f](https://github.com/garden-io/garden/commit/78cd007f))
* **config:** add ${git.commitHash} and ${git.originUrl} template fields ([246b9f67](https://github.com/garden-io/garden/commit/246b9f67))
* **core:** add --skip-dependencies CLI option ([94ab87f2](https://github.com/garden-io/garden/commit/94ab87f2))
* **k8s:** arbitrary shared secrets ([11d43b8c](https://github.com/garden-io/garden/commit/11d43b8c))
* **template:** add indent helper function ([c90ec372](https://github.com/garden-io/garden/commit/c90ec372))

### Improvements

* **core:** show error in watch footer ([01fb0ddf](https://github.com/garden-io/garden/commit/01fb0ddf))

<a name="0.12.33"></a>
## [0.12.33](https://github.com/garden-io/garden/compare/0.12.32...0.12.33) (2021-12-13)

### Bug Fixes

* **cloud:** add env and ns IDs to event payloads ([9a2f41c5](https://github.com/garden-io/garden/commit/9a2f41c5))
* **k8s:** remove startupProbes from task and test pods ([e616cae3](https://github.com/garden-io/garden/commit/e616cae3))

### Features

* **core:** module varfiles ([d63e1751](https://github.com/garden-io/garden/commit/d63e1751))

### Improvements

* **cloud:** add pagination to secrets list command ([72937979](https://github.com/garden-io/garden/commit/72937979))

<a name="0.12.32"></a>
## [0.12.32](https://github.com/garden-io/garden/compare/0.12.31...0.12.32) (2021-12-02)

### Bug Fixes

* **workflows:** fix provider resolution issue ([d1a7b49d](https://github.com/garden-io/garden/commit/d1a7b49d))

<a name="0.12.31"></a>
## [0.12.31](https://github.com/garden-io/garden/compare/0.12.30...0.12.31) (2021-10-12)

### Bug Fixes

* do not modify baseModule.spec.serviceResource and baseModule.spec.values by the values from the dependent modules ([70c49b1a](https://github.com/garden-io/garden/commit/70c49b1a))
* **core:** improve project config validation ([c08747ea](https://github.com/garden-io/garden/commit/c08747ea))
* **core:** ensure we print dev command banner at top ([d31792ef](https://github.com/garden-io/garden/commit/d31792ef))
* **exec:** statusCommand output not being respected ([8a5bcaee](https://github.com/garden-io/garden/commit/8a5bcaee))
* **exec:** error when calling garden CLI within exec module tasks ([3fdcffbb](https://github.com/garden-io/garden/commit/3fdcffbb))
* **helm:** more robust log streaming ([7c9a400c](https://github.com/garden-io/garden/commit/7c9a400c))
* **k8s:** delete env command would recreate namespace after delete ([b705c6f7](https://github.com/garden-io/garden/commit/b705c6f7))
* **template:** ignore errors in skipped ternary clause ([8b2eca53](https://github.com/garden-io/garden/commit/8b2eca53))

### Features

* **cli:** allow overriding default local address for port proxies ([21120c52](https://github.com/garden-io/garden/commit/21120c52))
* **cloud:** register session with API ([946b056a](https://github.com/garden-io/garden/commit/946b056a))
* **config:** support for-loops for lists ([e6a21527](https://github.com/garden-io/garden/commit/e6a21527))
* **config:** support list concatenation via $concat keys ([dc869466](https://github.com/garden-io/garden/commit/dc869466))

<a name="0.12.30"></a>
## [0.12.30](https://github.com/garden-io/garden/compare/0.12.29...0.12.30) (2021-11-05)

### Bug Fixes

* **container:** propagate privileged flag ([58cb5715](https://github.com/garden-io/garden/commit/58cb5715))
* **k8s:** backwards-compatible deployment logic ([b960b9c6](https://github.com/garden-io/garden/commit/b960b9c6))
* **k8s:** fix casing in ingress spec ([827ba407](https://github.com/garden-io/garden/commit/827ba407))
* **k8s:** use module ns in getServiceResource ([62dadfcc](https://github.com/garden-io/garden/commit/62dadfcc))
* **k8s:** validation fix in serviceResource schema ([f070729a](https://github.com/garden-io/garden/commit/f070729a))

### Features

* **k8s:** add timeout to container services ([2927fa5b](https://github.com/garden-io/garden/commit/2927fa5b))

<a name="0.12.28"></a>
## [0.12.28](https://github.com/garden-io/garden/compare/0.12.27...0.12.28) (2021-10-24)

### Bug Fixes

* **cli:** ensure help exits with code 0 ([9fb6a6ef](https://github.com/garden-io/garden/commit/9fb6a6ef))
* **core:** fix test dependencies for dev command ([930b59a3](https://github.com/garden-io/garden/commit/930b59a3))
* **core:** fix task batch partitioning algorithm ([5625e79d](https://github.com/garden-io/garden/commit/5625e79d))
* **k8s:** harbor registry support ([#2619](https://github.com/garden-io/garden/issues/2619)) ([edd5e3f4](https://github.com/garden-io/garden/commit/edd5e3f4))
* **k8s:** uncaught error when trying to patch namespace resource ([2ba8f6dd](https://github.com/garden-io/garden/commit/2ba8f6dd))
* **k8s:** fix port-forward error handling ([0c859255](https://github.com/garden-io/garden/commit/0c859255))

### Features

* **cloud:** emit session events on exit ([04f58d54](https://github.com/garden-io/garden/commit/04f58d54))
* **core:** add --force flag to dev command ([4312152d](https://github.com/garden-io/garden/commit/4312152d))
* **core:** allow sparse arrays for more fields ([b286373c](https://github.com/garden-io/garden/commit/b286373c))
* **k8s:** add two-way-resolved option for dev mode syncs ([6371af0d](https://github.com/garden-io/garden/commit/6371af0d))

<a name="0.12.27"></a>
## [0.12.27](https://github.com/garden-io/garden/compare/0.12.26...0.12.27) (2021-09-29)

### Bug Fixes

* fix namespace log line ([a4fa3626](https://github.com/garden-io/garden/commit/a4fa3626))
* **cli:** get rid of occasional EPIPE error printed after process exit ([571561cb](https://github.com/garden-io/garden/commit/571561cb))
* **core:** don't add mutating env vars to runtime context ([18c0f1d3](https://github.com/garden-io/garden/commit/18c0f1d3))
* **core:** ensure we return all callbacks when cloning files ([ecc43b94](https://github.com/garden-io/garden/commit/ecc43b94))
* **core:** omit `output.detail` from graph events ([e81a4976](https://github.com/garden-io/garden/commit/e81a4976))
* **core:** fix handling of empty option values ([ed8cee76](https://github.com/garden-io/garden/commit/ed8cee76))
* **dev-mode:** reuse sync log line ([80448980](https://github.com/garden-io/garden/commit/80448980))
* **workflows:** defer provider resolution ([039cca45](https://github.com/garden-io/garden/commit/039cca45))

### Features

* **cloud:** add trigger support for push events ([0db506d2](https://github.com/garden-io/garden/commit/0db506d2))
* **config:** allow skipping source template rendering in generateFiles ([e8406690](https://github.com/garden-io/garden/commit/e8406690))
* **k8s:** reverse sync modes ([3fece6ff](https://github.com/garden-io/garden/commit/3fece6ff))
* **k8s:** provider-level defaults for dev mode ([d6c62286](https://github.com/garden-io/garden/commit/d6c62286))

### Improvements

* **cloud:** more robust log streaming ([67f94bfe](https://github.com/garden-io/garden/commit/67f94bfe))
* **dev-mode:** log sync conflicts ([7467496e](https://github.com/garden-io/garden/commit/7467496e))
* **port-forward:** also bind to ::1 address by default ([0bd44ef4](https://github.com/garden-io/garden/commit/0bd44ef4))

<a name="0.12.26"></a>
## [0.12.26](https://github.com/garden-io/garden/compare/0.12.25...0.12.26) (2021-09-13)

### Bug Fixes

* **core:** fix duplicate status line in watch ([868e477f](https://github.com/garden-io/garden/commit/868e477f))

### Features

* add jib provider and jib-container module type ([e453d700](https://github.com/garden-io/garden/commit/e453d700))
* **cloud:** emit stack graph & task log events ([6382d3dd](https://github.com/garden-io/garden/commit/6382d3dd))
* **container:** more security options ([c0f14e1b](https://github.com/garden-io/garden/commit/c0f14e1b))
* **core:** emit live logs from k8s tasks and tests (WIP) ([bfbfb2f1](https://github.com/garden-io/garden/commit/bfbfb2f1))
* **internal:** support persistent commands in WS API ([3976e9d6](https://github.com/garden-io/garden/commit/3976e9d6))
* **logs:** allow filtering log lines by tag ([20babc2e](https://github.com/garden-io/garden/commit/20babc2e))
* **terraform:** add v1.0.5 as a supported version ([740a8eb2](https://github.com/garden-io/garden/commit/740a8eb2))

### Improvements

* log namespace and cloud URL ([c22b47bb](https://github.com/garden-io/garden/commit/c22b47bb))
* **core:** don't watch dev-enabled modules ([b1124723](https://github.com/garden-io/garden/commit/b1124723))
* **core:** add --forward flag to deploy command ([8f817d5f](https://github.com/garden-io/garden/commit/8f817d5f))

<a name="0.12.25"></a>
## [0.12.25](https://github.com/garden-io/garden/compare/0.12.24...0.12.25) (2021-08-23)

### Bug Fixes

* debug tests ([c7404c01](https://github.com/garden-io/garden/commit/c7404c01))
* **cli:** avoid cmd.exe windows popping up during execution ([ddb5ab93](https://github.com/garden-io/garden/commit/ddb5ab93))
* **cli:** don't print dev cmd banner when terminal doesn't support it ([3a637250](https://github.com/garden-io/garden/commit/3a637250))
* **cli:** error at end of process when writing error log ([cb68b2a4](https://github.com/garden-io/garden/commit/cb68b2a4))
* **config:** module variables weren't propagated right at parse time ([b1c52fab](https://github.com/garden-io/garden/commit/b1c52fab))
* **container:** fix hot reload target validation ([2d471360](https://github.com/garden-io/garden/commit/2d471360))
* **core:** deploy command wouldn't start port forwards with dev flag ([08b1e172](https://github.com/garden-io/garden/commit/08b1e172))
* **core:** don't omit dev mode services from deployment dependencies ([2a5df7cc](https://github.com/garden-io/garden/commit/2a5df7cc))
* **core:** bump file watcher DEFAULT_BUFFER_INTERVAL to 1250 ([d46e4578](https://github.com/garden-io/garden/commit/d46e4578))
* **core:** warn instead of error when attempting to scan non-directory ([d668622b](https://github.com/garden-io/garden/commit/d668622b))
* **core:** bad error messages for certain error types ([8500aec5](https://github.com/garden-io/garden/commit/8500aec5))
* **core:** performance issue with certain dependency structures ([b72de2e8](https://github.com/garden-io/garden/commit/b72de2e8))
* **core:** allow empty replacement strings in 'replace' helper function ([3686fb43](https://github.com/garden-io/garden/commit/3686fb43))
* **k8s:** error fetching mutagen CLI on Windows ([db362d95](https://github.com/garden-io/garden/commit/db362d95))
* **k8s:** persistentvolumeclaim modules would include unnecessary files ([41116475](https://github.com/garden-io/garden/commit/41116475))
* **k8s:** error when using dev mode on certain kubernetes modules ([5bfb3d70](https://github.com/garden-io/garden/commit/5bfb3d70))
* **k8s:** correctly handle Ingress API versions for container modules ([3764dfa7](https://github.com/garden-io/garden/commit/3764dfa7))
* **k8s:** intermittent errors when building/syncing to cluster ([d2828370](https://github.com/garden-io/garden/commit/d2828370))
* **k8s:** unexpected error when losing exec WS connection ([9400d630](https://github.com/garden-io/garden/commit/9400d630))
* **k8s:** error when re-starting registry in cleanup script ([5b8fe40c](https://github.com/garden-io/garden/commit/5b8fe40c))
* **k8s:** bad handling of directory paths for artifact sources ([92ee09a5](https://github.com/garden-io/garden/commit/92ee09a5))
* **k8s:** resolve issue with buildkit not caching ([#2480](https://github.com/garden-io/garden/issues/2480)) ([37f1f762](https://github.com/garden-io/garden/commit/37f1f762))
* **templates:** uuidv4() helper function was broken ([6c14777f](https://github.com/garden-io/garden/commit/6c14777f))

### Code Refactoring

* **k8s:** officially deprecate the cluster-docker build mode ([925b291a](https://github.com/garden-io/garden/commit/925b291a))

### Features

* allow passing additional tolerations to kaniko pods ([#2540](https://github.com/garden-io/garden/issues/2540)) ([3748092c](https://github.com/garden-io/garden/commit/3748092c))
* add ephemeralStorage limit and request configuration parameters for kubernetes builder, registry and sync ([1a9e2979](https://github.com/garden-io/garden/commit/1a9e2979))
* **cli:** add self-update command ([6dd23340](https://github.com/garden-io/garden/commit/6dd23340))
* **cloud:** stream command metadata ([de925e4c](https://github.com/garden-io/garden/commit/de925e4c))
* **core:** stream build statuses ([4bd1d0f3](https://github.com/garden-io/garden/commit/4bd1d0f3))
* **k8s:** add experimental mutagen-based build sync mode ([1d3e3072](https://github.com/garden-io/garden/commit/1d3e3072))
* **k8s:** allow setting podSelector on helm/kubernetes resource refs ([43e7cc82](https://github.com/garden-io/garden/commit/43e7cc82))
* **k8s:** manual port forward config for helm and kubernetes modules ([9111a480](https://github.com/garden-io/garden/commit/9111a480))
* **k8s:** add timeout parameter to kubernetes module type ([708f4c39](https://github.com/garden-io/garden/commit/708f4c39))
* **k8s:** allow owner/perm tweaks on dev mode syncs ([eb4be420](https://github.com/garden-io/garden/commit/eb4be420))
* **k8s:** port-forward to Deployments and DaemonSets ([8c2b7474](https://github.com/garden-io/garden/commit/8c2b7474))
* **k8s:** add `configmap` module type, mountable on container modules ([809dcb8c](https://github.com/garden-io/garden/commit/809dcb8c))

### Improvements

* **cli:** move error.log to .garden/error.log ([e13365e2](https://github.com/garden-io/garden/commit/e13365e2))
* **core:** don't explicitly create build tasks in dev command ([0aa68e20](https://github.com/garden-io/garden/commit/0aa68e20))
* **core:** do not truncate logger sections ([f462e3ac](https://github.com/garden-io/garden/commit/f462e3ac))
* **k8s:** better process mgmt and logging for dev mode sync ([7a01e41b](https://github.com/garden-io/garden/commit/7a01e41b))

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

