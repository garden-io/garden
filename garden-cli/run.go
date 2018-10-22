package main

import (
	"fmt"
	"log"
	"path"

	"github.com/garden-io/garden/garden-cli/dockerutil"
)

func runGardenService(projectName string, gitRoot string, relPath string, watch bool, args []string) error {
	homeDir := getHomeDir()
	gardenHomeDir := getGardenHomeDir()
	containerName := "garden-run-" + randSeq(6)
	workingDir := path.Join("/project", relPath)
	projectID := getProjectID(gitRoot)
	volumeName := dockerutil.GetVolumeName(projectName, projectID)

	// If the command requires a file system watch we mount the dedicated project volume,
	// if not we just bind mount the project dir directly
	var projectVolume string
	if watch {
		if !dockerutil.HasVolume(volumeName) {
			log.Fatal("No volume found for project")
		}
		projectVolume = volumeName
	} else {
		projectVolume = gitRoot
	}

	dockerArgs := append(
		[]string{
			"run", "-i", "--tty", "--rm",
			// Give the container direct access to the host network.
			"--net", "host",
			// Mount docker socket and configuration directories.
			"--volume", "/var/run/docker.sock:/var/run/docker.sock",
			"--volume", fmt.Sprintf("%s/.docker:/root/.docker", homeDir),
			"--volume", fmt.Sprintf("%s:/root/.garden", gardenHomeDir),
			"--volume", fmt.Sprintf("%s/.kube:/root/.kube", homeDir),
			"--volume", fmt.Sprintf("%s/.git:/root/garden/.git", gardenHomeDir),
			// Mount the project directory, either as a bind mount or as a named volume
			"--volume", fmt.Sprintf("%s:/project:delegated", projectVolume),
			"--workdir", workingDir,
			"--name", containerName,
			// TODO: use particular version of garden-service container
			"garden-service",
		},
		args...,
	)

	return dockerutil.Exec(dockerArgs, false)
}
