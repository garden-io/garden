// Package syncutil is for managing synchronization sessions between the host and the Garden sync container.
//
// Internally it uses Mutagen as a synchronization tool. Calls the gRPC API exposed by Mutagen if
// possible, otherwise executes mutagen commands directly.
// Note: Mutagen can run several sync sessions from the same source so we include mechanism
// for cleaning up duplicate sessions (although they shouldn't get created from our side).
package syncutil

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"time"

	"github.com/garden-io/garden/garden-cli/util"
	"github.com/havoc-io/mutagen/pkg/daemon"
	sessionsvcpkg "github.com/havoc-io/mutagen/pkg/service/session"
	sessionpkg "github.com/havoc-io/mutagen/pkg/session"
	"github.com/pkg/errors"
	"google.golang.org/grpc"
)

type SessionStatus int

const (
	Ready SessionStatus = iota
	NotReady
)

func (s SessionStatus) String() string {
	return [...]string{"Ready", "NotReady"}[s]
}

type Session struct {
	ID     string
	Source string
	Target string
	Status SessionStatus
}

// Helper functions for connecting to the Daemon, borrowed from here:
// https://github.com/havoc-io/mutagen/blob/master/cmd/mutagen/common.go
func createDaemonClientConnection() (*grpc.ClientConn, error) {
	// Create a context to timeout the dial.
	dialContext, cancel := context.WithTimeout(
		context.Background(),
		daemon.RecommendedDialTimeout,
	)
	defer cancel()

	// Perform dialing.
	return grpc.DialContext(
		dialContext,
		"",
		grpc.WithInsecure(),
		grpc.WithDialer(daemonDialer),
		grpc.WithBlock(),
	)
}

func daemonDialer(_ string, timeout time.Duration) (net.Conn, error) {
	return daemon.DialTimeout(timeout)
}

// Helper function for executing mutagen commands
func mutagenExec(args []string) error {
	binary := util.GetBin("mutagen")
	return exec.Command(binary, args...).Run()
}

// Helper function for getting all active Mutagen sessions
func getSessions(args []string) (*sessionsvcpkg.ListResponse, error) {
	var listResponse *sessionsvcpkg.ListResponse

	// Connect to the daemon and defer closure of the connection.
	daemonConnection, err := createDaemonClientConnection()
	if err != nil {
		return listResponse, errors.Wrap(err, "unable to connect to daemon")
	}
	defer daemonConnection.Close()

	// Create a session service client.
	sessionService := sessionsvcpkg.NewSessionsClient(daemonConnection)

	// Invoke list.
	request := &sessionsvcpkg.ListRequest{
		Specifications: args,
	}

	return sessionService.List(context.Background(), request)
}

// Starts sync daemon, no-op if already running
func StartSyncDaemon() error {
	return mutagenExec([]string{"daemon", "start"})
}

// Creates a new sync session and wait until status is ready before returning
func CreateSession(source string, targetContainer string, containerPath string) (Session, error) {
	var session Session

	target := fmt.Sprintf("docker://%s/%s", targetContainer, containerPath)
	if err := mutagenExec([]string{"create", source, target}); err != nil {
		return session, err
	}

	// wait until sync is complete
	timeout := time.After(120 * time.Second)
	tick := time.Tick(500 * time.Millisecond)
	// keep trying until the status is Ready, we get an error, or we time out
	for {
		select {
		case <-timeout:
			return session, errors.New("timed out waiting for sync to complete")
		case <-tick:
			session, _, err := FindSession(source)
			if err != nil {
				return session, err
			}

			switch session.Status {
			case Ready:
				return session, nil
			}
			// try again
		}
	}
}

// Terminate session (and remove duplicates)
func TerminateSession(source string) error {
	session, found, err := FindSession(source)
	if err != nil {
		return err
	}

	if !found {
		return nil
	}

	if err := RemoveDuplicateSessions(session); err != nil {
		return err
	}

	return mutagenExec([]string{"terminate", session.ID})
}

// Returns the first session found that matches the source
func FindSession(source string) (Session, bool, error) {
	var session Session
	found := false

	response, err := getSessions([]string{})
	if err != nil {
		return session, found, err
	}

	for _, s := range response.SessionStates {
		// Validate the list response contents.
		if err = s.EnsureValid(); err != nil {
			return session, found, errors.Wrap(err, "invalid session state detected in response")
		}

		var status SessionStatus
		switch s.Status {
		case sessionpkg.Status_Watching:
			status = Ready
		default:
			status = NotReady
		}

		if s.Session.Alpha.Path == source {
			found = true
			session = Session{
				ID:     s.Session.Identifier,
				Source: s.Session.Alpha.Path,
				Target: s.Session.Beta.Path,
				Status: status,
			}
			return session, found, nil
		}
	}
	return session, found, nil
}

// Given a session, removes all other sessions with the same source.
func RemoveDuplicateSessions(session Session) error {
	response, err := getSessions([]string{})
	if err != nil {
		return err
	}

	for _, s := range response.SessionStates {
		if err = s.EnsureValid(); err != nil {
			return errors.Wrap(err, "invalid session state detected in response")
		}

		// if there's another session with the same source we terminate it
		if s.Session.Alpha.Path == session.Source && s.Session.Identifier != session.ID {
			if err := mutagenExec([]string{"terminate", s.Session.Identifier}); err != nil {
				return errors.Wrap(err, "unable to terminate session "+s.Session.Identifier)
			}
		}
	}
	return nil
}
