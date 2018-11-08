// Package dockerutil containes utility funtions for interacting with the Docker SDK.
package dockerutil

import (
	"context"
	"os"
	"os/exec"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/garden-io/garden/garden-cli/util"
	"github.com/pkg/errors"
)

func RunContainer(
	containerConfig container.Config, hostConfig container.HostConfig, containerName string,
) (container.ContainerCreateCreatedBody, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	var resp container.ContainerCreateCreatedBody
	ctx := context.Background()

	resp, err = cli.ContainerCreate(ctx, &containerConfig, &hostConfig, nil, containerName)
	if err != nil {
		return resp, errors.Wrap(err, "unable to run container "+containerName)
	}

	if err := StartContainer(resp.ID); err != nil {
		return resp, errors.Wrap(err, "unable to start container "+containerName)
	}

	return resp, nil
}

func StartContainer(containerID string) error {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.ContainerStart(context.Background(), containerID, types.ContainerStartOptions{})
}

func Exec(args []string, silent bool) error {
	binary := util.GetBin("docker")
	cmd := exec.Command(binary, args...)

	cmd.Env = os.Environ()
	if !silent {
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
	}

	return cmd.Run()
}

func FindContainer(containerName string) (types.Container, bool, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	var container types.Container
	found := false

	containers, err := cli.ContainerList(context.Background(), types.ContainerListOptions{
		All: true,
	})
	if err != nil {
		return container, found, errors.Wrap(err, "unable to get container list")
	}

	for _, con := range containers {
		if con.Names[0] == "/"+containerName {
			found = true
			return con, found, nil
		}
	}
	return container, found, nil
}

func StopContainer(id string) error {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.ContainerStop(context.Background(), id, nil)
}

func CreateVolume(volumeName string) (types.Volume, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.VolumeCreate(context.Background(), volume.VolumesCreateBody{
		Name: volumeName,
	})
}

func FindVolume(volumeName string) (*types.Volume, bool, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	found := false
	var volume *types.Volume

	volumeResponse, err := cli.VolumeList(context.Background(), filters.NewArgs())
	if err != nil {
		return volume, found, errors.Wrap(err, "unable to get volume list")
	}

	for _, vol := range volumeResponse.Volumes {
		if vol.Name == volumeName {
			found = true
			return vol, found, nil
		}
	}
	return volume, found, nil
}

func Ping() (types.Ping, error) {
	cli, err := client.NewEnvClient()
	util.Check(err)

	return cli.Ping(context.Background())
}
