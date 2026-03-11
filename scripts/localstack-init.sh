#!/bin/bash
# Runs inside LocalStack on startup — creates the S3 bucket
set -e

echo "Creating vibehub-artifacts bucket in LocalStack…"
awslocal s3 mb s3://vibehub-artifacts --region us-east-1
echo "Bucket created."
