FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/mock-provider .

FROM alpine:3.22
RUN adduser -D -u 10001 app
USER app
COPY --from=build /bin/mock-provider /bin/mock-provider
EXPOSE 9090
ENTRYPOINT ["/bin/mock-provider"]
