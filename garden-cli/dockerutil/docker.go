package dockerutil

import (
	"context"
	"log"
	"os"
	"os/exec"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/garden-io/garden/garden-cli/util"
)

func RunContainer(
	containerConfig container.Config, hostConfig container.HostConfig, containerName string,
) (container.ContainerCreateCreatedBody, error) {
	ctx := context.Background()
	cli, err := client.NewEnvClient()
	util.Check(err)

	resp, err := cli.ContainerCreate(ctx, &containerConfig, &hostConfig, nil, containerName)
	util.Check(err)

	err = StartContainer(resp.ID)

	return resp, err
}

func StartContainer(containerID string) error {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.ContainerStart(context.Background(), containerID, types.ContainerStartOptions{})
}

func Exec(args []string, silent bool) error {
	binary, err := exec.LookPath("docker")
	if err != nil {
		log.Fatal("Could not find docker - Garden requires docker to be installed in order to run.")
	}

	cmd := exec.Command(binary, args...)

	cmd.Env = os.Environ()
	if !silent {
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
	}

	return cmd.Run()
}

func FindContainer(containerName string) (types.Container, bool) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	containers, err := cli.ContainerList(context.Background(), types.ContainerListOptions{
		All: true,
	})
	util.Check(err)

	var container types.Container

	for _, con := range containers {
		if con.Names[0] == "/"+containerName {
			container = con
			return container, true
		}
	}
	return container, false
}

func StopContainer(id string) error {
	cli, err := client.NewEnvClient()
	util.Check(err)

	err = cli.ContainerStop(context.Background(), id, nil)
	return err
}

func CreateVolume(volumeName string) error {
	cli, err := client.NewEnvClient()
	util.Check(err)

	_, err = cli.VolumeCreate(context.Background(), volume.VolumesCreateBody{
		Name: volumeName,
	})
	return err
}

func FindVolume(volumeName string) (*types.Volume, bool) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	volumeResponse, err := cli.VolumeList(context.Background(), filters.NewArgs())
	util.Check(err)

	var volume *types.Volume

	for _, vol := range volumeResponse.Volumes {
		if vol.Name == volumeName {
			volume = vol
			return volume, true
		}
	}
	return volume, false
}

func GetVolumeName(projectName string, projectID string) string {
	return "garden-volume--" + projectName + "-" + projectID
}

func Ping() (types.Ping, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.Ping(context.Background())
}
