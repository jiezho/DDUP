#!/usr/bin/env python3
"""Fix MinIO systemd service with correct credentials"""

import subprocess
import time

ACCESS_KEY = "3e3000ac4876defd0a59f8b88f8d9c39"
SECRET_KEY = "6no5L3jkID4hX3jG5NQZ59aqRWYVvnjq0OcmYKL5ZE"

service_content = f"""[Unit]
Description=MinIO Object Storage
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=root
Group=root
Restart=on-failure
RestartSec=5
Environment=MINIO_ROOT_USER={ACCESS_KEY}
Environment=MINIO_ROOT_PASSWORD={SECRET_KEY}
Environment=MINIO_BROWSER_REDIRECT_URL=
ExecStart=/usr/local/bin/minio server /opt/minio/data --console-address :9001
ExecStop=/bin/kill -s TERM $MAINPID
KillSignal=SIGTERM
SendSIGKILL=yes

[Install]
WantedBy=multi-user.target
"""

with open("/etc/systemd/system/minio.service", "w") as f:
    f.write(service_content)

print("Service file written successfully")
print(f"MINIO_ROOT_USER={ACCESS_KEY}")

# Reload and restart
subprocess.run(["systemctl", "daemon-reload"], check=True)
subprocess.run(["systemctl", "stop", "minio"], check=False)

# Clear old config
subprocess.run(["rm", "-rf", "/opt/minio/data/.minio.sys"], check=False)

subprocess.run(["systemctl", "start", "minio"], check=True)
print("MinIO restarted")

# Wait for health
for i in range(10):
    result = subprocess.run(
        ["curl", "-fsS", "http://127.0.0.1:9000/minio/health/live"],
        capture_output=True
    )
    if result.returncode == 0:
        print("MinIO is healthy")
        break
    time.sleep(1)
else:
    print("WARNING: MinIO health check timeout")
