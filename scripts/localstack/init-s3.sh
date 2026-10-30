#!/bin/sh
# Creates the document bucket once LocalStack reports ready. LocalStack runs
# every executable in /etc/localstack/init/ready.d on startup.
set -eu

BUCKET="${S3_BUCKET:-docpilot-documents}"

if awslocal s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket $BUCKET already exists"
else
  awslocal s3 mb "s3://$BUCKET"
  echo "created bucket $BUCKET"
fi

# The web app uploads straight to storage in some flows, so allow the local
# dev origin to read and write.
awslocal s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'
