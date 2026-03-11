package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Provider is the storage abstraction used by VibeProject.
type Provider interface {
	Read(relativePath string) (string, error)
	Write(relativePath string, content string) error
	Exists(relativePath string) (bool, error)
	List(prefix string) ([]string, error)
}

// ── FileSystem ────────────────────────────────────────────────────────────────

type FileSystem struct{ root string }

func NewFileSystem(root string) *FileSystem { return &FileSystem{root: root} }

func (f *FileSystem) abs(rel string) string { return filepath.Join(f.root, rel) }

func (f *FileSystem) Read(rel string) (string, error) {
	raw, err := os.ReadFile(f.abs(rel))
	if err != nil {
		return "", fmt.Errorf("storage read %q: %w", rel, err)
	}
	return string(raw), nil
}

func (f *FileSystem) Write(rel, content string) error {
	abs := f.abs(rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	return os.WriteFile(abs, []byte(content), 0o644)
}

func (f *FileSystem) Exists(rel string) (bool, error) {
	_, err := os.Stat(f.abs(rel))
	if os.IsNotExist(err) {
		return false, nil
	}
	return err == nil, err
}

func (f *FileSystem) List(prefix string) ([]string, error) {
	dir := f.abs(prefix)
	var out []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(f.root, path)
		out = append(out, rel)
		return nil
	})
	if os.IsNotExist(err) {
		return nil, nil
	}
	return out, err
}

// ── S3 ────────────────────────────────────────────────────────────────────────

type S3Store struct {
	client *s3.Client
	bucket string
	prefix string
}

func NewS3(ctx context.Context, bucket, prefix string) (*S3Store, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	// Support LocalStack via AWS_ENDPOINT_URL
	var opts []func(*s3.Options)
	if endpoint := os.Getenv("AWS_ENDPOINT_URL"); endpoint != "" {
		opts = append(opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		})
	}
	return &S3Store{client: s3.NewFromConfig(cfg, opts...), bucket: bucket, prefix: strings.TrimSuffix(prefix, "/") + "/"}, nil
}

func (s *S3Store) key(rel string) string { return s.prefix + rel }

func (s *S3Store) Read(rel string) (string, error) {
	out, err := s.client.GetObject(context.Background(), &s3.GetObjectInput{Bucket: &s.bucket, Key: aws.String(s.key(rel))})
	if err != nil {
		return "", err
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(out.Body)
	return string(raw), err
}

func (s *S3Store) Write(rel, content string) error {
	_, err := s.client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         aws.String(s.key(rel)),
		Body:        strings.NewReader(content),
		ContentType: aws.String("text/plain; charset=utf-8"),
	})
	return err
}

func (s *S3Store) Exists(rel string) (bool, error) {
	_, err := s.client.HeadObject(context.Background(), &s3.HeadObjectInput{Bucket: &s.bucket, Key: aws.String(s.key(rel))})
	if err != nil {
		return false, nil
	}
	return true, nil
}

func (s *S3Store) List(prefix string) ([]string, error) {
	fullPrefix := s.key(prefix)
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{Bucket: &s.bucket, Prefix: &fullPrefix})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return nil, err
		}
		for _, obj := range page.Contents {
			if obj.Key != nil {
				keys = append(keys, strings.TrimPrefix(*obj.Key, s.prefix))
			}
		}
	}
	return keys, nil
}

// ── Factory ───────────────────────────────────────────────────────────────────

func Create(ctx context.Context, rootPath, prefix string) (Provider, error) {
	driver := os.Getenv("VIBEHUB_STORAGE")
	if driver == "s3" {
		bucket := os.Getenv("S3_BUCKET")
		if bucket == "" {
			return nil, fmt.Errorf("S3_BUCKET env var required when VIBEHUB_STORAGE=s3")
		}
		return NewS3(ctx, bucket, prefix)
	}
	return NewFileSystem(rootPath), nil
}
