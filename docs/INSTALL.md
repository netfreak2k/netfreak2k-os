# Installation

Netfreak2k Server is designed to install alongside an existing Debian or Ubuntu host without replacing the operating system.

## One-command installation

```bash
curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh | sudo bash
```

The installer:

- keeps the existing Linux installation
- does not repartition disks
- does not install or alter a bootloader
- does not replace the desktop environment
- installs Netfreak2k under `/opt/netfreak2k`
- uses Docker Compose
- uses existing Docker if already present
- installs Docker only on plain Debian/Ubuntu when Docker is absent and no conflicting container packages are detected
- aborts instead of removing/replacing existing container packages
- uses port 80 if free
- automatically falls back to port 8080 if port 80 is already in use
- preserves Netfreak2k Docker volumes across updates

## First start

After installation the script prints the URL, typically:

```text
http://SERVER-IP/
```

If port 80 was already occupied:

```text
http://SERVER-IP:8080/
```

The first browser visit opens the local admin setup.

## Update

```bash
sudo /opt/netfreak2k/scripts/update-server.sh
```

## Uninstall

```bash
sudo /opt/netfreak2k/scripts/uninstall-server.sh
```

Uninstall removes Netfreak2k program files and Netfreak2k containers/network, but deliberately leaves:

- Docker itself
- unrelated containers
- unrelated Docker volumes
- Netfreak2k persistent data volumes
- the host operating system

Persistent Netfreak2k data can be removed manually only when explicitly desired.
