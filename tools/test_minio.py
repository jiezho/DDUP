#!/usr/bin/env python3
"""Test MinIO upload and download"""

import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="http://127.0.0.1:9000",
    aws_access_key_id="3e3000ac4876defd0a59f8b88f8d9c39",
    aws_secret_access_key="6no5L3jkID4hX3jG5NQZ59aqRWYVvnjq0OcmYKL5ZE",
    region_name="us-east-1",
    config=Config(signature_version="s3v4"),
)

# Upload test file
with open("/tmp/test-upload.txt", "w") as f:
    f.write("Hello DDUP Shared Library")

s3.upload_file("/tmp/test-upload.txt", "ddup-shared-library", "test/hello.txt")
print("Upload: OK")

# Download and verify
resp = s3.get_object(Bucket="ddup-shared-library", Key="test/hello.txt")
content = resp["Body"].read().decode()
assert content == "Hello DDUP Shared Library", f"Content mismatch: {content}"
print(f"Download: OK - content='{content}'")

# List objects
objects = s3.list_objects_v2(Bucket="ddup-shared-library", Prefix="test/")
print(f"Objects in test/: {[o['Key'] for o in objects.get('Contents', [])]}")

print("All tests passed")
