# Telemetry

Whenever you run a Garden command we collect anonymized telemetry and send it to [Segment.io](https://segment.io).
It helps us understand how our users use Garden and aids our decision process when prioritizing new features, bug fixing, etc.

We put great effort in making sure we only collect completely anonymized data: We use random generated UUIDs for identifying users and we hash sensitive information using SHA-256.

## Examples of events we collect

Below you can find examples of events we currently collect.

### Identify

Sent the first time a Garden command is run on a machine.

```js
{
  userId: '8fd322d7-bad3-4bbb-82cb-cebf3f804a37',
  traits: {
    gardenVersion: '0.10.16',
    platform: 'darwin',
    platformVersion: '18.7.0',
    isCI: false
  }
}
```

### Run Command

Sent every time a Garden command is run.

```js
{
  userId: '1a4d5101-d64a-49ea-a85f-7c35e591461a',
  event: 'Run Command',
  properties: {
    isCI: true,
    name: 'deploy',
    projectId: '740fa4458581c6983614a7c72ea9e9bcec46350fa965bc66b0979c7a5b4dd951',
    projectMetadata: {
      moduleTypes: [
        'container'
      ],
      modulesCount: 2,
      servicesCount: 2,
      tasksCount: 0,
      testsCount: 2
    },
    projectName: 'c333b9667097f729ecfdadeb89b200663a6783290e4e2e65004cd74b4570a5c0',
    ciName: 'CircleCI',
    sessionId: 'dcb9738d-ed92-4e5b-a85c-ed219eb99829',
    system: {
      gardenVersion: '0.10.16',
      platform: 'linux',
      platformVersion: '4.15.0-1027-gcp'
    }
  }
}
```

### Run Task

Sent for each event triggered by the Stack Graph.

```js
{
  userId: 'cba7eb41-a370-4869-81a2-a0b21ae89c71',
  event: 'Run Task',
  properties: {
    batchId: '944c9523-e2cd-42ef-bad5-13290354fb68',
    isCI: false,
    projectId: '740fa4458581c6983614a7c72ea9e9bcec46350fa965bc66b0979c7a5b4dd951',
    projectMetadata: {
      moduleTypes: [
        'test'
      ],
      numberOfModules: 3,
      numberOfServices: 3,
      numberOfTasks: 3,
      numberOfTests: 5
    },
    projectName: 'a738fa3f8e942e6101e0cf3c86b5a3261107ec18dd448a96f3b3ce96b9ff7a10',
    ciName: 'CircleCI',
    sessionId: '0045487d-4859-4826-b53f-c4f77719a945',
    system: {
      gardenVersion: '0.10.16',
      platform: 'darwin',
      platformVersion: '18.7.0'
    },
    taskName: '3ce7d581095184d695bf1965775076d66ae4b3ddc2560aef4d8d09b338a001ed',
    taskStatus: 'taskComplete',
    taskType: 'build'
  }
}
```

### Call API

Sent whenever the Dashboard makes an API call to Garden.

```js
{
  userId: 'cba7eb41-a370-4869-81a2-a0b21ae89c71',
  event: 'Call API',
  properties: {
    isCI: false,
    name: 'POST request',
    path: '/api',
    projectId: '740fa4458581c6983614a7c72ea9e9bcec46350fa965bc66b0979c7a5b4dd951',
    projectMetadata: {
      moduleTypes: [
        'test'
      ],
      numberOfModules: 3,
      numberOfServices: 3,
      numberOfTasks: 3,
      numberOfTests: 5
    },
    projectName: 'a738fa3f8e942e6101e0cf3c86b5a3261107ec18dd448a96f3b3ce96b9ff7a10',
    ciName: 'CircleCI',
    sessionId: 'd801253b-746f-432f-99c6-d82fad953b9c',
    system: {
      gardenVersion: '0.10.16',
      platform: 'darwin',
      platformVersion: '18.7.0'
    }
  }
}
```

## Updating your telemetry preferences

If you would like to update your analytics settings, please run:

```sh
    garden config analytics-enabled true|false
```
