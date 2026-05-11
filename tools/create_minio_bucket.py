#!/usr/bin/env python3
"""Create MinIO bucket using boto3"""

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ENDPOINT = "http://127.0.0.1:9000"
ACCESS_KEY = "3e3000ac4876defd0a59f8b88f8d9c39"
SECRET_KEY = "6no5L3jkID4hX3jG5NQZ59aqRWYVvnjq0OcmYKL5ZE"
BUCKET = "ddup-shared-library"
REGION = "us-east-1"

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name=REGION,
    config=Config(signature_version="s3v4"),
)

try:
    s3.create_bucket(Bucket=BUCKET)
    print(f"Bucket '{BUCKET}' created successfully")
except ClientError as e:
    if e.response["Error"]["Code"] == "BucketAlreadyOwnedByYou":
        print(f"Bucket '{BUCKET}' already exists")
    else:
        print(f"Error: {e}")
        raise

# Set bucket policy for read access to objects
policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{BUCKET}/*"],
        }
    ],
}

import json
s3.put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(policy))
print(f"Bucket policy set: public read for objects")

# List buckets to verify
buckets = s3.list_buckets()
print(f"All buckets: {[b['Name'] for b in buckets['Buckets']]}")
