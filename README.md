# Drum-Notation
Webapp for practicing drums offline.

## How to use

### Method 1: Docker GHCR/CICD

This is supported on both amd64 and arm64 systems.

```bash

# pull image
docker pull ghcr.io/cjn4825/drum-notation:latest

# run image with needed args
docker run -d \
  --name drum-notation \
  --restart unless-stopped \
  -p 8000:8000 \
  -v "$(pwd)/routines:/app/routines" \
  --user "$(id -u):$(id -g)" \
  ghcr.io/cjn4825/drum-notation:latest

# (optional) Use watchtower to auto pull new iamges
docker run -d \
  --name watchtower \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/nicholas-fedor/watchtower:latest \
  --interval 300 \
  --cleanup \
  drum-notation

```

### Method 2: Docker local

```bash

# Build image
docker build -t drum-notation <cloned dir path>

# run with needed args
docker run -d \
  --name drum-notation \
  --restart unless-stopped \
  -p 8000:8000 \
  -v "$(pwd)/routines:/app/routines" \
  --user "$(id -u):$(id -g)" \
  drum-notation
```

### Method 3: No Docker

```bash
# Manually use the Python-based http server on the server.
# defaults to port 8000 localhost
python3 ~/drum-notation/server.py
```

## Practice Files
* Practice Files are saved in the routines folder
* You can freely create valid files in the dir (No spaces or slashes and need to end in .txt)
* As long as you click the save button, any changes are saved on the host in both install methods
