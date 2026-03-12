# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY packages/cli/go.mod packages/cli/go.sum* ./
RUN go mod download 2>/dev/null || true

COPY packages/cli/ .
RUN go build -o /vibe -ldflags="-s -w" .

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates git

COPY --from=builder /vibe /usr/local/bin/vibe

ENTRYPOINT ["vibe"]
CMD ["--help"]
