package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"unicode/utf8"
)

// KubectlParameters represents the JSON structure of kubectl parameters and
// arguments that will be smuggled via the SSH hostname in Base64 encoding.
type KubectlParameters struct {
	// KubectlPath is the path to the kubectl executable.
	KubectlPath string `json:"kubectlPath"`
	// KubectlArgs are the arguments to be passed to kubectl.
	KubectlArgs []string `json:"kubectlArgs"`
}

// fatal is a utility function to exit with an error message.
func fatal(message string) {
	fmt.Fprintln(os.Stderr, "error:", message)
	os.Exit(1)
}

func main() {
	// Identify the first non-flag argument, which should be the hostname. All
	// of the flags that Mutagen passes to SSH will bind the value to the flag
	// (e.g. -oConnectTimeout=X), with the exception of -p, which Mutagen won't
	// specify in this case since all Garden URLs will use a default port.
	// Likewise, no username will be specified and prepended to the hostname.
	// Thus, the first non-flag argument will be the hostname field, through
	// which we'll smuggle kubectl exec parameters. Mutagen will then provide
	// the default agent path within the container, but we'll ignore that since
	// the target agent path will be provided in the kubectl exec parameters
	// that we receive.
	var hostname string
	for _, arg := range os.Args[1:] {
		if !strings.HasPrefix(arg, "-") {
			hostname = arg
			break
		}
	}
	if hostname == "" {
		fatal("empty hostname specified")
	}

	// Replace all '_' in the hostname with '/' to undo the hack performed to
	// work around Mutagen's local path detection heuristic.
	hostname = strings.ReplaceAll(hostname, "_", "/")

	// Decode the hostname specification into raw JSON bytes.
	rawJSON, err := base64.StdEncoding.DecodeString(hostname)
	if err != nil {
		fatal(fmt.Errorf("invalid data: %w", err).Error())
	} else if len(rawJSON) == 0 {
		fatal("empty data")
	} else if !utf8.Valid(rawJSON) {
		fatal("non-UTF-8 data")
	}

	// Decode the kubectl parameters.
	var parameters KubectlParameters
	decoder := json.NewDecoder(bytes.NewReader(rawJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&parameters); err != nil {
		fatal(fmt.Errorf("unable to decode JSON data: %w", err).Error())
	} else if decoder.More() {
		fatal("extra JSON data provided")
	}

	// Set up termination signal handling so that we can forward signals to
	// kubectl exec. Note that both of these signal types are emulated on
	// Windows, so they are valid, though on Windows it will typically be the
	// forwarded closure of standard input that signals termination because
	// Mutagen can't trigger the emulated handling of these signals.
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	// Set up the kubectl command.
	kubectl := exec.Command(parameters.KubectlPath, parameters.KubectlArgs...)
	kubectl.Stdin = os.Stdin
	kubectl.Stdout = os.Stdout
	kubectl.Stderr = os.Stderr

	// Start the kubectl command.
	if err := kubectl.Start(); err != nil {
		fatal(fmt.Errorf("unable to start kubectl exec: %w", err).Error())
	}

	// Monitor for termination of the kubectl process.
	termination := make(chan error, 1)
	go func() {
		termination <- kubectl.Wait()
	}()

	// Loop and forward signals until the kubectl process exits.
	for {
		select {
		case s := <-signals:
			kubectl.Process.Signal(s)
		case err := <-termination:
			if err != nil {
				os.Exit(1)
			}
			return
		}
	}
}
