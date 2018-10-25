package main

import (
	"fmt"

	"github.com/garden-io/garden/garden-cli/dockerutil"
)

// TODO: Sync container life cycle management. At the moment, the sync runs in watch mode indefinitely.
func runSyncContainer(projectName string, gitRoot string, relPath string) error {
	homeDir := getHomeDir()
	projectID := getProjectID(gitRoot)
	containerName := "garden-sync--" + projectName + "-" + projectID
	volumeName := dockerutil.GetVolumeName(projectName, projectID)

	if !dockerutil.HasVolume(volumeName) {
		dockerutil.MakeVolume(volumeName)
	}

	if dockerutil.HasContainer(containerName) {
		return nil
	}

	dockerArgs := []string{
		"run", "-d", "--rm",
		// Mount docker socket and configuration directories.
		"--volume", "/var/run/docker.sock:/var/run/docker.sock",
		"--volume", fmt.Sprintf("%s/.docker:/root/.docker", homeDir),
		// Mount the project directory.
		"--volume", fmt.Sprintf("%s:/host-mount:delegated", gitRoot),
		// TODO Use delegated?
		"--volume", fmt.Sprintf("%s:/project", volumeName),
		"--name", containerName,
		"garden-sync",
	}

	return dockerutil.Exec(dockerArgs, false)
}
