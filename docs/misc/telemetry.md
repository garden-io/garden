---
order: 3
title: Telemetry
---

# Telemetry

Whenever you run a Garden command we collect anonymized telemetry and send it to [Segment.io](https://segment.io).
It helps us understand how our users use Garden and aids our decision process when prioritizing new features, bug fixing, etc.

We put great effort in making sure we only collect completely anonymized data: We use random generated UUIDs for identifying users and we hash sensitive information using SHA-256.

## Examples of events we collect

Below you can find examples of events we currently collect.

### Identify

Sent the first time a Garden command is run on a machine.

```json
{
  "anonymousId": "3c16127b-8c51-4f6a-943a-f67b91295999",
  "traits": {
    "userIdV2": "steadfast-slippery-birthday_833c47738e851d0d71a0c606fb7d3999",
    "platform": "darwin",
    "platformVersion": "24.3.0",
    "gardenVersion": "0.13.53",
    "isCI": false,
    "firstRunAt": "2023-02-28T09:28:24.000Z",
    "latestRunAt": "2025-02-11T15:35:09.967Z",
    "isRecurringUser": true
  }
}
```

### Run Command

Sent every time a Garden command is run.

```json
{
  "anonymousId": "3c16127b-8c51-4f6a-943a-f67b91295999",
  "event": "Run Command",
  "properties": {
    "projectId": "7a4a9238b43ea6d6c19a17e5c866f20672a0f644cf14eeade62c96374bf12faf4fd6ce3f1854bb81f39b8051869380b30885262365fd9818cfc1b98266390999",
    "projectIdV2": "grouchy-female-ticket_7a4a9238b43ea6d6c19a17e5c866f999",
    "projectName": "833c47738e851d0d71a0c606fb7d3e153dfc88b6370cfbe3f8d8acbede6a8ad7a92b9d88090eb2e8167c7882573f2df418742e46b6d38f8d28e94b77f3e29999",
    "projectNameV2": "steadfast-slippery-birthday_833c47738e851d0d71a0c606fb7d3999",
    "enterpriseDomain": "2769c2abae62151b2ebb8658628f7c5f5d0dc0c29fdefdd19a23dec9cb0a7b96d74d82512d1f6906bef65b24a29d84685dfd2fd66964a56fbdaff39fabd69999",
    "enterpriseDomainV2": "ratty-willing-science_2769c2abae62151b2ebb8658628f7999",
    "isLoggedIn": false,
    "ciName": null,
    "system": {
      "platform": "darwin",
      "platformVersion": "24.3.0",
      "gardenVersion": "0.13.53"
    },
    "isCI": false,
    "sessionId": "ab062965-c29c-43e2-bdbe-b8f80dfe2999",
    "parentSessionId": "ab062965-c29c-43e2-bdbe-b8f80dfe2999",
    "projectMetadata": {
      "modulesCount": 1,
      "moduleTypes": ["container"],
      "tasksCount": 0,
      "servicesCount": 0,
      "testsCount": 0,
      "actionsCount": 17,
      "buildActionCount": 4,
      "runActionCount": 4,
      "deployActionCount": 6,
      "testActionCount": 3,
      "buildActionCountByType": {
        "container": 4
      },
      "runActionCountByType": {
        "container": 3,
        "exec": 1
      },
      "testActionCountByType": {
        "container": 3
      },
      "deployActionCountByType": {
        "container": 6
      },
      "providerNames": ["exec", "container"],
      "actionTypes": ["container", "exec"]
    },
    "firstRunAt": "2023-02-28T09:28:24.000Z",
    "latestRunAt": "2025-02-11T15:35:09.967Z",
    "isRecurringUser": true,
    "environmentName": "local",
    "name": "validate"
  }
}
```

### Call API

Sent whenever an API call is made to Garden.

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

You can also disable telemetry by setting the environment variable `GARDEN_DISABLE_ANALYTICS`:

```sh
export GARDEN_DISABLE_ANALYTICS=true
```
