---
order: 10
title: Automatic Environment Cleanup
---

## Overview

The Automatic Environment Cleanup (AEC) feature allows you to automatically clean up or pause environments in your Kubernetes cluster after a period of inactivity or on a scheduled basis. This helps reduce costs and resource usage by ensuring that unused environments don't consume cluster resources indefinitely.

{% hint style="info" %}
This feature requires Garden Cloud and is currently in beta. It's currently only available for the Kubernetes provider.
{% endhint %}

## How it Works

The AEC feature consists of two main components:

1. **AEC Agent**: A lightweight service that runs in your Kubernetes cluster and monitors environment activity
2. **Environment Configuration**: Project-level configuration that defines when and how environments should be cleaned up

The AEC agent runs continuously in your cluster, checking all Garden-managed namespaces for configured cleanup triggers. When a trigger condition is met, the agent performs the specified action:

- **Pause**: Scales down all workloads in the environment to zero replicas, preserving configuration and data
- **Cleanup**: Completely removes the environment namespace and all its resources

The agent tracks the last deployment time for each environment and compares it against your configured triggers. It also sends status updates to Garden Cloud, allowing you to monitor cleanup activities through the Garden Cloud dashboard.

## Quickstart

Follow these steps to quickly set up automatic environment cleanup:

### 1. Prerequisites

- Working Garden configuration for a Kubernetes project
- Admin/owner access to your Garden Cloud organization
- Logged in to Garden Cloud via `garden login` from your project root

### 2. Configure Environment Cleanup

Add AEC configuration to one of the environments in your `project.garden.yml`:

```yaml
kind: Project
name: my-project
environments:
  - name: <env-name>
    # Add the following:
    aec:
      triggers:
        - action: pause
          timeAfterLastUpdate:
            value: 1
            unit: days
        - action: cleanup
          timeAfterLastUpdate:
            value: 7
            unit: days
```

### 3. Install the AEC Agent

Install the AEC agent in your Kubernetes cluster:

```bash
# For remote clusters
garden plugins kubernetes setup-aec --env <env-name>

# For local clusters (Docker Desktop, minikube, etc.)
garden plugins local-kubernetes setup-aec --env <local-env>
```

### 4. Deploy and Test

Deploy to your environment:

```bash
garden deploy --env preview
```

That's it! Your environment will now be automatically paused after 1 day of inactivity and cleaned up after 7 days.

## Configuration

AEC is configured at the environment level in your project configuration. You define triggers that specify when cleanup should occur and what action to take.

For complete configuration reference, see the [`environments[].aec`](../../reference/project-config.md#environmentsaec) section in the Project Configuration documentation.

### Basic Configuration

Add the `aec` configuration to your environment in your `project.garden.yml` or `garden.yml` file:

```yaml
kind: Project
name: my-project
environments:
  - name: preview
    aec:
      triggers:
        - action: pause
          timeAfterLastUpdate:
            value: 1
            unit: days
        - action: cleanup
          timeAfterLastUpdate:
            value: 7
            unit: days
```

This configuration will:

1. Pause the environment after 1 day of inactivity
2. Clean up the environment after 7 days of inactivity

### Schedule-Based Cleanup

You can also configure cleanup to happen on a schedule, regardless of activity:

```yaml
environments:
  - name: staging
    aec:
      triggers:
        - action: cleanup
          schedule:
            every: friday
            hourOfDay: 18
            minuteOfHour: 0
```

This will clean up the staging environment every Friday at 6:00 PM.

### Advanced Configuration

Here's a more comprehensive example showing multiple triggers and different scenarios:

```yaml
environments:
  - name: development
    aec:
      # Disable AEC for this environment (useful with templating)
      disabled: false
      triggers:
        # Pause after 2 hours of inactivity during weekdays
        - action: pause
          timeAfterLastUpdate:
            value: 2
            unit: hours
        # Clean up every weekday at 7 PM
        - action: cleanup
          schedule:
            every: weekday
            hourOfDay: 19
            minuteOfHour: 0
        # Also clean up after 3 days of inactivity as a fallback
        - action: cleanup
          timeAfterLastUpdate:
            value: 3
            unit: days

  - name: feature-branch
    aec:
      triggers:
        # Quick cleanup for feature branches
        - action: cleanup
          timeAfterLastUpdate:
            value: 6
            unit: hours
```

## Installing the AEC Agent

Before the AEC feature can work, you need to install the AEC agent in your Kubernetes cluster. The agent is a lightweight service that monitors your environments and performs cleanup actions.

### Prerequisites

- Garden Cloud account with a paid subscription
- Kubernetes cluster with Garden deployed
- Admin access to your Garden Cloud organization
- Logged in to Garden Cloud via `garden login`

### Installation

Use the `garden plugins kubernetes setup-aec` command to install the agent:

```bash
garden plugins kubernetes setup-aec --env <env>
```

This command will:

1. Create a service account in Garden Cloud for the agent
2. Deploy the AEC agent to your cluster's system namespace
3. Configure the agent with the necessary permissions and credentials

The agent will be deployed as a Kubernetes Deployment in the same namespace where Garden's system components are installed (typically `garden-system`).

To install in a local Kubernetes cluster (e.g. Docker Desktop, minkube, Orbstack etc.) you can use:

```bash
garden plugins local-kubernetes setup-aec --env <local env name>
```

### Verification

After installation, you can verify that the agent is running:

```bash
kubectl get deployments -n garden-system
```

You should see a deployment named `garden-aec-agent` in the running state.

## Monitoring and Logs

### Viewing AEC Agent Logs

To monitor the AEC agent's activity and troubleshoot issues, you can view its logs using:

```bash
garden plugins kubernetes aec-logs --env <env>
```

To stream logs continuously (useful for monitoring):

```bash
garden plugins kubernetes aec-logs --env <env> -- --follow
```

If you're using a local Kubernetes cluster, use `garden plugins local-kubernetes` instead of `garden plugins kubernetes` in the above commands.

The logs will show:

- Environment scanning activity
- Trigger evaluations
- Cleanup actions performed
- Any errors or warnings

### Garden Cloud Dashboard

The AEC agent sends status updates to Garden Cloud, allowing you to monitor cleanup activities through the Garden Cloud dashboard. You can see:

- Which environments are configured for AEC
- Recent cleanup actions
- Agent status and health

## Best Practices

### 1. Start with Pause Actions

Begin with pause actions before implementing full cleanup to ensure your configuration works as expected:

```yaml
triggers:
  - action: pause
    timeAfterLastUpdate:
      value: 1
      unit: days
```

### 2. Use Multiple Triggers

Combine inactivity-based and schedule-based triggers for comprehensive cleanup:

```yaml
triggers:
  # Pause after inactivity
  - action: pause
    timeAfterLastUpdate:
      value: 1
      unit: days
  # Clean up on weekends
  - action: cleanup
    schedule:
      every: sunday
      hourOfDay: 2
      minuteOfHour: 0
```

### 3. Environment-Specific Configuration

Configure different cleanup policies for different environment types:

```yaml
environments:
  - name: production
    # No AEC for production
    aec:
      disabled: true

  - name: staging
    aec:
      triggers:
        - action: cleanup
          timeAfterLastUpdate:
            value: 3
            unit: days

  - name: preview
    aec:
      triggers:
        # Aggressive cleanup for preview environments
        - action: cleanup
          timeAfterLastUpdate:
            value: 6
            unit: hours
```

### 4. Use Templating for Dynamic Configuration

Leverage Garden's templating to make AEC configuration dynamic:

```yaml
environments:
  - name: dev
    aec:
      disabled: ${var.aec-disabled || false}
      triggers:
        - action: cleanup
          timeAfterLastUpdate:
            value: ${var.cleanup-hours || 24}
            unit: hours
```

## Troubleshooting

### Agent Not Starting

If the AEC agent fails to start:

1. Check the agent logs: `garden plugins kubernetes aec-logs`
2. Verify Garden Cloud connectivity
3. Ensure your Garden Cloud subscription includes AEC
4. Check Kubernetes permissions and resources

### Environments Not Being Cleaned Up

If environments aren't being cleaned up as expected:

1. Verify the environment has the correct Garden annotations
2. Check that triggers are properly configured
3. Review agent logs for trigger evaluation messages
4. Ensure the environment has been deployed at least once (to establish a "last update" time)

### Unexpected Cleanup

If environments are being cleaned up unexpectedly:

1. Review your trigger configuration
2. Check the agent logs to see which trigger was matched
3. Verify the last deployment time of the environment
4. Consider using more conservative time periods initially

## Limitations

- Currently only available for the Kubernetes provider
- Requires a Garden Cloud account
- The feature is in beta and may have limitations or changes
- Schedule-based triggers use the cluster's timezone
- Minimum cleanup interval is 1 minute (agent check frequency)

## Security Considerations

The AEC agent requires permissions to:

- List and read namespaces in the cluster
- Scale deployments and statefulsets to zero (for pause action)
- Delete namespaces (for cleanup action)
- Read and write namespace annotations

These permissions are automatically configured during installation, but ensure your cluster security policies allow these operations.
