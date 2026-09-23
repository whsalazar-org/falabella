package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel/trace/noop"
)

func testServer() *server {
	return &server{
		client:         http.DefaultClient,
		models:         []string{"demo-model"},
		frontendOrigin: "http://localhost:3000",
		tracer:         noop.NewTracerProvider().Tracer("test"),
	}
}

func TestListModels(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	response := httptest.NewRecorder()

	testServer().routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var body map[string][]string
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body["models"]) != 1 || body["models"][0] != "demo-model" {
		t.Fatalf("models = %v", body["models"])
	}
}

func TestChatRejectsUnsupportedModel(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/v1/chat",
		strings.NewReader(`{"model":"unknown","messages":[{"role":"user","content":"hello"}]}`))
	response := httptest.NewRecorder()

	testServer().routes().ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestCompleteReturnsProviderMessage(t *testing.T) {
	expectedAuth := "Bearer " + "test-" + "key"
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != expectedAuth {
			t.Error("provider request is missing authorization")
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Hello!"}}]}`))
	}))
	defer provider.Close()

	s := testServer()
	s.providerURL = provider.URL
	s.apiKey = "test-key"
	answer, err := s.complete(context.Background(), chatRequest{
		Model:    "demo-model",
		Messages: []message{{Role: "user", Content: "Hi"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if answer.Content != "Hello!" || answer.Role != "assistant" {
		t.Fatalf("answer = %#v", answer)
	}
}
