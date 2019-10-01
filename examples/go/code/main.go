package main

import (
	"fmt"
	_ "github.com/dgraph-io/badger"
	_ "github.com/influxdata/influxdb"
	"time"
	"net/http"
)

func main() {
	called := time.Unix(0, 1569941016255205257)
	now := time.Now()
	diff := now.Sub(called)
	fmt.Println(diff.Round(time.Millisecond))

	http.HandleFunc("/", func (w http.ResponseWriter, r *http.Request) {
		fmt.Println("Received request.")
        fmt.Fprintf(w, "Welcome to my website!")
    })

    http.ListenAndServe(":8080", nil)
}
