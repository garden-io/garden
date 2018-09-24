package main

import (
	"path"
	"fmt"
	"log"
	"os"
	"os/exec"
)

// TODO: we may want to use one of the docker go client libs instead of shelling out here, but this works for now so...
func runGardenService(projectName string, gitRoot string, relPath string, args []string) error {
	homeDir := getHomeDir()
	gardenHomeDir := getGardenHomeDir()
	containerName := "garden-run-" + randSeq(6)
	workingDir := path.Join("/project", relPath)

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
			// Mount the project directory.
			// TODO: sync into a garden-sync container instead
			"--volume", fmt.Sprintf("%s:/project:delegated", gitRoot),
			"--workdir", workingDir,
			"--name", containerName,
			// TODO: use particular version of garden-service container
			"garden-service",
		},
		args...,
	)
	// fmt.Println("docker ", args)

	binary, err := exec.LookPath("docker")
	if err != nil {
		log.Fatal("Could not find docker - Garden requires docker to be installed in order to run.")
	}

	cmd := exec.Command(binary, dockerArgs...)

	cmd.Env = os.Environ()
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout

	return cmd.Run()
}
