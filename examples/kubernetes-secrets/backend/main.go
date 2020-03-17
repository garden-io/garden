package main

import (
	"fmt"
	"net/http"
	"os"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, os.Getenv("SECRET_VAR"))
}

func main() {
	http.HandleFunc("/hello-backend", handler)
	fmt.Println("Server running...")

	http.ListenAndServe(":8080", nil)
}
