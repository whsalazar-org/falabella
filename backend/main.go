package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []message `json:"messages"`
}

type chatResponse struct {
	Message message `json:"message"`
}

type providerResponse struct {
	Choices []struct {
		Message message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type server struct {
	client         *http.Client
	providerURL    string
	apiKey         string
	models         []string
	frontendOrigin string
	tracer         trace.Tracer
}

func main() {
	ctx := context.Background()
	shutdown, err := configureTracing(ctx)
	if err != nil {
		log.Fatalf("configure Langfuse tracing: %v", err)
	}
	defer func() {
		if err := shutdown(context.Background()); err != nil {
			log.Printf("flush traces: %v", err)
		}
	}()

	s := newServer()
	httpServer := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           s.routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("API listening on %s", httpServer.Addr)
	if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newServer() *server {
	models := splitNonEmpty(env("AI_MODELS", "gpt-4o-mini,gpt-4.1-mini"))
	return &server{
		client:         &http.Client{Timeout: 60 * time.Second},
		providerURL:    env("AI_API_URL", "https://api.openai.com/v1/chat/completions"),
		apiKey:         os.Getenv("AI_API_KEY"),
		models:         models,
		frontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:3000"),
		tracer:         otel.Tracer("falabella-ai-api"),
	}
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/models", s.listModels)
	mux.HandleFunc("POST /v1/chat", s.chat)
	return s.cors(mux)
}

func (s *server) listModels(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]string{"models": s.models})
}

func (s *server) chat(w http.ResponseWriter, r *http.Request) {
	var request chatRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.validate(request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if s.apiKey == "" {
		writeError(w, http.StatusServiceUnavailable, "AI_API_KEY is not configured")
		return
	}

	ctx, span := s.tracer.Start(r.Context(), "chat "+request.Model,
		trace.WithAttributes(
			attribute.String("gen_ai.operation.name", "chat"),
			attribute.String("gen_ai.request.model", request.Model),
			attribute.Int("gen_ai.request.messages.count", len(request.Messages)),
		),
	)
	defer span.End()

	answer, err := s.complete(ctx, request)
	if err != nil {
		span.RecordError(err)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	span.SetAttributes(attribute.String("gen_ai.response.model", request.Model))
	writeJSON(w, http.StatusOK, chatResponse{Message: answer})
}

func (s *server) validate(request chatRequest) error {
	if !slices.Contains(s.models, request.Model) {
		return errors.New("unsupported model")
	}
	if len(request.Messages) == 0 || len(request.Messages) > 100 {
		return errors.New("messages must contain between 1 and 100 items")
	}
	for _, item := range request.Messages {
		if item.Role != "user" && item.Role != "assistant" && item.Role != "system" {
			return errors.New("message role must be user, assistant, or system")
		}
		if strings.TrimSpace(item.Content) == "" {
			return errors.New("message content cannot be empty")
		}
	}
	return nil
}

func (s *server) complete(ctx context.Context, request chatRequest) (message, error) {
	payload, err := json.Marshal(request)
	if err != nil {
		return message{}, fmt.Errorf("encode provider request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.providerURL, bytes.NewReader(payload))
	if err != nil {
		return message{}, fmt.Errorf("create provider request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(req)
	if err != nil {
		return message{}, fmt.Errorf("contact model provider: %w", err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return message{}, fmt.Errorf("read provider response: %w", err)
	}
	var provider providerResponse
	if err := json.Unmarshal(body, &provider); err != nil {
		return message{}, errors.New("model provider returned an invalid response")
	}
	if response.StatusCode >= http.StatusBadRequest {
		if provider.Error != nil && provider.Error.Message != "" {
			return message{}, fmt.Errorf("model provider: %s", provider.Error.Message)
		}
		return message{}, fmt.Errorf("model provider returned status %d", response.StatusCode)
	}
	if len(provider.Choices) == 0 || strings.TrimSpace(provider.Choices[0].Message.Content) == "" {
		return message{}, errors.New("model provider returned no answer")
	}
	return provider.Choices[0].Message, nil
}

func (s *server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") == s.frontendOrigin {
			w.Header().Set("Access-Control-Allow-Origin", s.frontendOrigin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func configureTracing(ctx context.Context) (func(context.Context) error, error) {
	publicKey, secretKey := os.Getenv("LANGFUSE_PUBLIC_KEY"), os.Getenv("LANGFUSE_SECRET_KEY")
	if publicKey == "" || secretKey == "" {
		log.Print("Langfuse credentials not configured; tracing is disabled")
		return func(context.Context) error { return nil }, nil
	}

	endpoint := strings.TrimRight(env("LANGFUSE_BASE_URL", "https://cloud.langfuse.com"), "/") +
		"/api/public/otel/v1/traces"
	auth := base64.StdEncoding.EncodeToString([]byte(publicKey + ":" + secretKey))
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpoint),
		otlptracehttp.WithHeaders(map[string]string{"Authorization": "Basic " + auth}),
	)
	if err != nil {
		return nil, err
	}
	res, err := resource.New(ctx, resource.WithAttributes(
		semconv.ServiceName("falabella-ai-api"),
	))
	if err != nil {
		return nil, err
	}
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(provider)
	return provider.Shutdown, nil
}

func splitNonEmpty(value string) []string {
	var values []string
	for item := range strings.SplitSeq(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			values = append(values, item)
		}
	}
	return values
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"error": detail})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write response: %v", err)
	}
}
