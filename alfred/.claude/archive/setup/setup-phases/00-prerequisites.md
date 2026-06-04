# Phase 0: Prerequisites Check

**Purpose**: Verify and install required dependencies before starting AIfred setup.

**Run this phase FIRST before any other setup steps.**

---

## Prerequisite Categories

| Dependency | Required | Purpose |
|------------|----------|---------|
| Git | **Yes** | Version control, syncing |
| Pulse (`pulse`) | **Yes** | Task management across sessions |
| Docker | Recommended | MCP servers, container management |
| Homebrew (macOS only) | Optional | Package management (NOT required for Docker) |

---

## Step 1: Detect Operating System

```bash
# macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "DETECTED: macOS"
  OS_TYPE="macos"

# Linux
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "DETECTED: Linux"
  OS_TYPE="linux"

# WSL
elif grep -qi microsoft /proc/version 2>/dev/null; then
  echo "DETECTED: Windows (WSL)"
  OS_TYPE="wsl"
fi
```

**Store OS_TYPE for use in later steps.**

---

## Step 2: Check Required Dependencies

### Git (Required)

```bash
if command -v git &> /dev/null; then
  echo "✅ Git installed: $(git --version)"
else
  echo "❌ Git NOT installed"
  GIT_MISSING=true
fi
```

**If Git is missing:**

| OS | Installation Command |
|----|---------------------|
| macOS | `xcode-select --install` (includes Git) |
| Ubuntu/Debian | `sudo apt update && sudo apt install git` |
| Fedora/RHEL | `sudo dnf install git` |
| WSL | Follow Linux instructions |

---

### Pulse Task Management (Required)

```bash
if command -v pulse &> /dev/null; then
  echo "✅ Pulse CLI installed: $(pulse --version 2>/dev/null || echo 'version unknown')"
else
  echo "❌ Pulse CLI NOT installed"
  PULSE_MISSING=true
fi
```

**If Pulse is missing:**

```bash
# Pulse runs as a Docker service (FastAPI + PostgreSQL)
# The CLI is installed separately for task management
# Install from the Pulse source directory:
cd pulse && pip install -e . && cd ..
# Or install globally if published to your package index

# Verify installation
pulse --help
```

> **Note**: Pulse is deployed via Docker Compose. The CLI connects to the running service. Run `bash scripts/bootstrap.sh` for automated setup.

AIfred uses Pulse for all task tracking, session provenance, and priority management. Without it, the task management system, session actor hook, and priority workflows will not function.

> **Hard gate**: CLAUDE.md enforces these prerequisites automatically. If checks fail, Claude will run `bash scripts/bootstrap.sh` before proceeding.

---

## Step 3: Check Docker

### Detection

```bash
# Detect Docker variant: Docker Engine, Docker Desktop, Podman, or none
DOCKER_VARIANT="none"

if command -v podman &> /dev/null; then
  DOCKER_VARIANT="podman"
  echo "ℹ️ Podman detected (Docker-compatible, with limitations)"
fi

if command -v docker &> /dev/null; then
  if docker info 2>/dev/null | grep -q "Desktop"; then
    DOCKER_VARIANT="docker-desktop"
    echo "✅ Docker Desktop detected: $(docker --version)"

    # Warn if Docker Desktop is running on Linux (performance implications)
    if [[ "$OS_TYPE" == "linux" ]]; then
      echo ""
      echo "⚠️ Docker Desktop on Linux detected."
      echo "   Docker Desktop on Linux uses a VM layer which adds overhead."
      echo "   Docker Engine (native) is recommended for Linux for better performance."
      echo "   See: https://docs.docker.com/desktop/linux/install/"
    fi
  else
    DOCKER_VARIANT="docker-engine"
    echo "✅ Docker Engine detected: $(docker --version)"
  fi

  # Check if Docker daemon is running
  if docker info &> /dev/null; then
    echo "✅ Docker daemon is running"
    DOCKER_STATUS="running"
  else
    echo "⚠️ Docker installed but daemon NOT running"
    DOCKER_STATUS="installed_not_running"
  fi

  # Check Docker minimum version (require 20.10+ for Compose V2 and modern features)
  DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1)
  if [[ -n "$DOCKER_VERSION" && "$DOCKER_VERSION" -lt 20 ]]; then
    echo "⚠️ Docker version is older than 20.10. Upgrade recommended."
    echo "   Current: $(docker --version)"
    echo "   Required: 20.10+"
  fi

  # Check Docker Compose V2 (built-in 'docker compose' plugin vs legacy 'docker-compose')
  if docker compose version &> /dev/null; then
    echo "✅ Docker Compose V2 available: $(docker compose version --short 2>/dev/null)"
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &> /dev/null; then
    echo "⚠️ Docker Compose V1 (legacy 'docker-compose') detected."
    echo "   Docker Compose V2 is required. Install the compose plugin:"
    echo "   - Linux: sudo apt install docker-compose-plugin (or dnf equivalent)"
    echo "   - Other: https://docs.docker.com/compose/install/"
    COMPOSE_CMD="docker-compose"
    COMPOSE_V1_WARNING=true
  else
    echo "❌ Docker Compose not found."
    echo "   Install the Docker Compose plugin:"
    echo "   - Linux: sudo apt install docker-compose-plugin"
    echo "   - macOS/Win: Included with Docker Desktop"
    COMPOSE_MISSING=true
  fi
else
  if [[ "$DOCKER_VARIANT" == "podman" ]]; then
    echo "ℹ️ Only Podman found — Docker Engine or Docker Desktop is recommended for full compatibility."
    DOCKER_STATUS="podman_only"
  else
    echo "❌ Docker NOT installed"
    DOCKER_STATUS="not_installed"
  fi
fi
```

### If Docker Not Installed

**Ask user:**
> "Docker is not installed. Docker enables MCP servers (Memory, Browser automation) and container management.
>
> Would you like to install Docker?"
> - Yes, install Docker now
> - No, skip Docker features
> - I'll install it manually later

### Installation Instructions by OS

#### macOS - Docker Desktop (Recommended)

**IMPORTANT: Homebrew is NOT required for Docker on macOS.**

```
OPTION A: Download directly (Recommended)
-----------------------------------------
1. Open: https://www.docker.com/products/docker-desktop/
2. Click "Download for Mac" (Apple Silicon or Intel)
3. Open the downloaded .dmg file
4. Drag Docker.app to Applications folder
5. Open Docker from Applications
6. Wait for "Docker Desktop is running" in menu bar
7. Run: docker --version (to verify)

OPTION B: Via Homebrew (if you have it)
---------------------------------------
brew install --cask docker
open /Applications/Docker.app
```

**After installation, wait 30-60 seconds for Docker to fully start.**

#### Linux (Ubuntu/Debian)

```bash
# Remove old versions
sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null

# Install prerequisites
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Add Docker's GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group (avoids sudo)
sudo usermod -aG docker $USER
echo "⚠️ Log out and back in for group changes to take effect"

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

#### Linux (Fedora/RHEL)

```bash
# Install Docker
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

#### WSL (Windows Subsystem for Linux)

```
1. Install Docker Desktop for Windows from:
   https://www.docker.com/products/docker-desktop/

2. In Docker Desktop settings:
   - Enable "Use WSL 2 based engine"
   - Under Resources > WSL Integration, enable your distro

3. Restart WSL:
   wsl --shutdown

4. Open new WSL terminal and verify:
   docker --version
```

---

## Step 4: Validate Docker Installation

**IMPORTANT: Always re-check Docker status after installation attempt.**

```bash
echo "Validating Docker installation..."

# Give Docker time to start (especially on Mac)
sleep 5

# Check again
if command -v docker &> /dev/null && docker info &> /dev/null; then
  echo "✅ Docker is installed and running"
  docker --version
  DOCKER_STATUS="running"
else
  if command -v docker &> /dev/null; then
    echo "⚠️ Docker is installed but not running"
    echo ""
    echo "Try starting Docker:"
    echo "  - macOS: Open Docker.app from Applications"
    echo "  - Linux: sudo systemctl start docker"
    DOCKER_STATUS="installed_not_running"
  else
    echo "❌ Docker installation not detected"
    DOCKER_STATUS="not_installed"
  fi
fi
```

**Do NOT proceed to Phase 1 until Docker status is confirmed if user chose to install.**

---

## Step 5: Check Optional Dependencies

### Homebrew (macOS only - Optional)

```bash
if [[ "$OS_TYPE" == "macos" ]]; then
  if command -v brew &> /dev/null; then
    echo "✅ Homebrew installed: $(brew --version | head -1)"
  else
    echo "ℹ️ Homebrew not installed (optional)"
    echo "   Install later if needed: https://brew.sh"
  fi
fi
```

### Node.js (Optional - for some MCP servers)

```bash
if command -v node &> /dev/null; then
  echo "✅ Node.js installed: $(node --version)"
else
  echo "ℹ️ Node.js not installed (optional - some MCP servers need it)"
fi
```

### Python (Optional - for some MCP servers)

```bash
if command -v python3 &> /dev/null; then
  echo "✅ Python installed: $(python3 --version)"
else
  echo "ℹ️ Python not installed (optional - some MCP servers need it)"
fi
```

---

## Prerequisites Summary

After checking, display summary:

```
╔══════════════════════════════════════════════════╗
║            AIfred Prerequisites Check            ║
╠══════════════════════════════════════════════════╣
║ OS: [macOS/Linux/WSL]                            ║
╠══════════════════════════════════════════════════╣
║ REQUIRED                                         ║
║   Git:       ✅ Installed / ❌ Missing            ║
║   Pulse:     ✅ Running / ❌ Missing              ║
╠══════════════════════════════════════════════════╣
║ REQUIRED FOR PULSE                               ║
║   Docker:    ✅ Running / ⚠️ Not Running / ❌ N/A ║
║   Variant:   Engine / Desktop / Podman           ║
║   Version:   ✅ 20.10+ / ⚠️ Outdated             ║
║   Compose:   ✅ V2 (plugin) / ⚠️ V1 / ❌ Missing  ║
╠══════════════════════════════════════════════════╣
║ OPTIONAL                                         ║
║   Node.js:  ✅ / ℹ️ Not installed                 ║
║   Python:   ✅ / ℹ️ Not installed                 ║
║   Homebrew: ✅ / ℹ️ Not installed (macOS)         ║
╚══════════════════════════════════════════════════╝
```

---

## Automated Setup (Recommended)

Run the bootstrap script for automated prerequisite verification and Pulse deployment:

```bash
bash scripts/bootstrap.sh
```

Use `--check` to validate without changes, or `--non-interactive` for unattended setup.

---

## Proceed Checklist

Before moving to Phase 1:

- [ ] Git is installed
- [ ] Docker is installed and running (required for Pulse)
- [ ] Docker version ≥ 20.10
- [ ] Docker Compose V2 plugin available (`docker compose version` succeeds)
- [ ] Required tools installed: jq, yq, python3, curl
- [ ] If Docker Desktop on Linux: performance implications acknowledged
- [ ] Pulse deployed and healthy (`curl http://localhost:8700/api/v1/health`)
- [ ] pulse CLI installed (`pulse --help`)

---

*Phase 0 of 7 - Prerequisites Check*
