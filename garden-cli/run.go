package main

import (
	"fmt"
	"path"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/util"
)

func runGardenService(projectName string, gitRoot string, relPath string, args []string) error {
	homeDir := util.GetHomeDir()
	gardenHomeDir := getGardenHomeDir()
	projectID := getProjectID(gitRoot)
	containerName := "garden-service--" + projectName + "-" + projectID
	workingDir := path.Join(ProjectPath, relPath)
	volumeName := dockerutil.GetVolumeName(projectName, projectID)

	serviceContainer, found := dockerutil.FindContainer(containerName)

	if found && serviceContainer.State != "running" {
		err := dockerutil.StartContainer(serviceContainer.ID)
		util.Check(err)
	}

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
			// we mount ~/.git and ~/.ssh to allow the container to pull down private git repos
			fmt.Sprintf("%s/.git:/root/.git", homeDir),
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

		_, err := dockerutil.RunContainer(containerConfig, hostConfig, containerName)
		util.Check(err)
	}

	// run the command inside the garden-service container
	execArgs := append([]string{"exec", "-it", containerName, "garden"}, args...)
	return dockerutil.Exec(execArgs, false)
}
