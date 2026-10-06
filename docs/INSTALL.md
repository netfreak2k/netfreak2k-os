# Installation on Linux Mint

Netfreak2k runs in the background on Linux Mint and is opened through the host IP in a browser.

It installs only the runtime components needed by Netfreak2k:

- Docker/Compose for ordinary Netfreak2k workloads
- KVM/QEMU + libvirt
- OVMF/UEFI firmware
- restricted Netfreak2k VM agent
- Home Assistant OS as a dedicated KVM VM

It does **not** repartition the disk, replace Linux Mint, replace the bootloader, or remove the Mint desktop.

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/netfreak2k/netfreak2k-os/main/install.sh | sudo bash
```

Requirements:

- amd64 Linux Mint/Ubuntu host
- Intel VT-x or AMD-V enabled in BIOS/UEFI
- internet access during installation
- port 8123 free for Home Assistant

The installer creates Home Assistant OS with 2 vCPU, 4 GB RAM and a 64 GB expandable qcow2 disk. HAOS itself provides Home Assistant Core, Supervisor, Apps/Add-ons, HAOS updates and backups.

## Access

Netfreak2k:

```text
http://MINT-IP/
```

If port 80 is occupied, Netfreak2k uses port 8080.

Home Assistant OS:

```text
http://MINT-IP:8123/
```

The Netfreak2k dashboard also provides Home Assistant start, shutdown, restart and open controls.

## Uninstall

```bash
sudo /opt/netfreak2k/scripts/uninstall-server.sh
```

For safety, uninstall does not delete the HAOS VM or its virtual disk automatically.
