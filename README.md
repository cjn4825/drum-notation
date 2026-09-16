# Drum-Notation
Simple, local drum notation builder for playing drums while reading sheet music.

## How to use

### Method 1: Docker

Build the image.

```bash
# be in the drum-notation dir
# or just specify the cloned dir
docker build -t drum-notation .
```

Run the image with these arguments:

```bash
docker run -d --name drum-notation \
  -p 8000:8000 \
  -v "$(pwd)/routines:/app/routines" \
  --user "$(id -u):$(id -g)" \
  drum-notation
```

If the container is stopped without a restart policy or docker Compose use:

```bash
docker start drum-notation
```

But it's better to automate this with the above mentioned methods plus of more.

### Method 2: No Docker

Just start the Python-based http server with this on the server.

```bash
python3 ~/drum-notation/server.py
```

Once confirmed working, open localhost port 8000 in a browser.

## Practice Files
* Practice Files are saved in the routines folder
* You can freely create valid files in the dir (No spaces or slashes and need to end in .txt)
* As long as you click the save button, any changes are saved on the host in both install methods

## Future Features/Ideas
* Build out both Practice tabs more to include more than just quarter notes
* Allow wav files and upload music
* Build out the practice section to look nicer than a simple text doc look
* Maybe build this out more to be a full learning platform for drums for free

## Disclaimer
* Work in progress
* Also mostly vibe-coded since I don't care to learn the JavaScript/CSS/HTML stack in depth. Focusing on the deployment and future CI/CD part
