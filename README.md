# Drum-Notation
Simple, local drum notation builder for playing drums while reading sheet music.

## How to use

### Method 1: Docker

Build the image

```bash
# be in the drum-notation dir
# or just specify the cloned dir
docker build -t drum-notation .
```

Run the image

```bash
docker run -d --name drum-notation \
  -p 8000:8000 \
  -v "$(pwd)/routines:/app/routines" \
  --user "$(id -u):$(id -g)" \
  drum-notation
```

### Method 2: No Docker

```bash
python3 ~/drum-notation/server.py --bind 0.0.0.0
```

Then open localhost port 8000 in a browser

## Future Features/Ideas
* Eventually this will run on a Raspberry Pi in my HomeLab, so I'll change it to allow that
* Allow wav files and upload music
* Build out the practice section to look nicer than a simple text doc look
* Maybe build this out more to be a full learning platform for drums for free

## Disclaimer
* Work in progress
* Also mostly vibe-coded since I don't care to learn the JavaScript/CSS/HTML stack in depth. Focusing on the deployment and future CI/CD part
