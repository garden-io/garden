package main

import (
	"fmt"
	"path"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/util"
	"github.com/pkg/errors"
)

// Runs the garden service container and executes the command inside the container
func runServiceContainer(containerName string, volumeName string, relPath string) error {
	homeDir := util.GetHomeDir()
	gardenHomeDir := getGardenHomeDir()
	workingDir := path.Join(ProjectPath, relPath)

	serviceContainer, found, err := dockerutil.FindContainer(containerName)
	if err != nil {
		return err
	}

	// Start the container if found but not running
	if found && serviceContainer.State != "running" {
		if err := dockerutil.StartContainer(serviceContainer.ID); err != nil {
			return errors.Wrap(err, "unable to start garden service container")
		}
	}

	// Create and run the container if not found
	if !found {
		volumeMounts := []mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: volumeName,
				Target: ProjectPath,
			},
		}
		bindMounts := []string{
			"/var/run/docker.sock:/var/run/docker.sock",
			fmt.Sprintf("%s/.docker:/root/.docker", homeDir),
			fmt.Sprintf("%s/.kube:/root/.kube", homeDir),
			// we mount ~/.ssh to allow the container to pull down private git repos
			fmt.Sprintf("%s/.ssh:/root/.ssh", homeDir),
			fmt.Sprintf("%s:/root/.garden", gardenHomeDir),
		}

		containerConfig := container.Config{
			Image:      ServiceImage,
			Tty:        true,
			OpenStdin:  true,
			Cmd:        []string{"/bin/sh"},
			WorkingDir: workingDir,
		}

		hostConfig := container.HostConfig{
			Binds:       bindMounts,
			Mounts:      volumeMounts,
			AutoRemove:  true,
			NetworkMode: "host", // TODO Test if correct
		}

		if _, err := dockerutil.RunContainer(containerConfig, hostConfig, containerName); err != nil {
			return errors.Wrap(err, "unable to run garden service container")
		}
	}

	return nil
}
