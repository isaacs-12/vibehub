package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "modernc.org/sqlite"
)

type ProjectRecord struct {
	ID        string
	Name      string
	RootPath  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Repository interface {
	Save(ctx context.Context, p ProjectRecord) error
	FindByID(ctx context.Context, id string) (*ProjectRecord, error)
	FindAll(ctx context.Context) ([]ProjectRecord, error)
	Delete(ctx context.Context, id string) error
	Close() error
}

// ── SQLite ────────────────────────────────────────────────────────────────────

type SQLiteRepo struct{ db *sql.DB }

func NewSQLite(dbPath string) (*SQLiteRepo, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		root_path TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`)
	if err != nil {
		return nil, err
	}
	return &SQLiteRepo{db: db}, nil
}

func (r *SQLiteRepo) Save(ctx context.Context, p ProjectRecord) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES(?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET name=excluded.name, root_path=excluded.root_path, updated_at=excluded.updated_at`,
		p.ID, p.Name, p.RootPath, p.CreatedAt.Format(time.RFC3339), p.UpdatedAt.Format(time.RFC3339))
	return err
}

func (r *SQLiteRepo) FindByID(ctx context.Context, id string) (*ProjectRecord, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id,name,root_path,created_at,updated_at FROM projects WHERE id=?`, id)
	return scanProject(row)
}

func (r *SQLiteRepo) FindAll(ctx context.Context) ([]ProjectRecord, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,name,root_path,created_at,updated_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProjectRecord
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *SQLiteRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	return err
}

func (r *SQLiteRepo) Close() error { return r.db.Close() }

// ── Postgres ──────────────────────────────────────────────────────────────────

type PostgresRepo struct{ pool *pgxpool.Pool }

func NewPostgres(ctx context.Context, connString string) (*PostgresRepo, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, err
	}
	_, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		root_path TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL
	)`)
	if err != nil {
		return nil, err
	}
	return &PostgresRepo{pool: pool}, nil
}

func (r *PostgresRepo) Save(ctx context.Context, p ProjectRecord) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO projects(id,name,root_path,created_at,updated_at) VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, root_path=EXCLUDED.root_path, updated_at=EXCLUDED.updated_at`,
		p.ID, p.Name, p.RootPath, p.CreatedAt, p.UpdatedAt)
	return err
}

func (r *PostgresRepo) FindByID(ctx context.Context, id string) (*ProjectRecord, error) {
	row := r.pool.QueryRow(ctx, `SELECT id,name,root_path,created_at,updated_at FROM projects WHERE id=$1`, id)
	var p ProjectRecord
	err := row.Scan(&p.ID, &p.Name, &p.RootPath, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PostgresRepo) FindAll(ctx context.Context) ([]ProjectRecord, error) {
	rows, err := r.pool.Query(ctx, `SELECT id,name,root_path,created_at,updated_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProjectRecord
	for rows.Next() {
		var p ProjectRecord
		if err := rows.Scan(&p.ID, &p.Name, &p.RootPath, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PostgresRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, id)
	return err
}

func (r *PostgresRepo) Close() error { r.pool.Close(); return nil }

// ── Factory ───────────────────────────────────────────────────────────────────

func Create(ctx context.Context) (Repository, error) {
	driver := os.Getenv("VIBEHUB_DB")
	if driver == "postgres" {
		connStr := os.Getenv("DATABASE_URL")
		if connStr == "" {
			return nil, fmt.Errorf("DATABASE_URL required when VIBEHUB_DB=postgres")
		}
		return NewPostgres(ctx, connStr)
	}
	home, _ := os.UserHomeDir()
	return NewSQLite(filepath.Join(home, ".vibehub", "projects.db"))
}

// ── scanner helper ────────────────────────────────────────────────────────────

type scanner interface {
	Scan(dest ...any) error
}

func scanProject(s scanner) (*ProjectRecord, error) {
	var p ProjectRecord
	var createdAt, updatedAt string
	if err := s.Scan(&p.ID, &p.Name, &p.RootPath, &createdAt, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	p.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	p.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &p, nil
}
