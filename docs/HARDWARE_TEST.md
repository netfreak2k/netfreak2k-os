# Hardware and VM Test Checklist

Use this checklist for every milestone image.

## VM smoke test

- [ ] ISO boots
- [ ] graphical desktop appears
- [ ] login/session works
- [ ] keyboard layout works
- [ ] mouse works
- [ ] display resolution changes
- [ ] NetworkManager is present
- [ ] internet connection works
- [ ] audio stack starts
- [ ] software center opens
- [ ] Flatpak is available
- [ ] LibreOffice opens
- [ ] PDF reader opens
- [ ] VLC opens
- [ ] reboot works
- [ ] shutdown works

## Physical hardware

- [ ] Ethernet
- [ ] Wi-Fi
- [ ] Bluetooth
- [ ] speakers/headphones
- [ ] microphone
- [ ] webcam
- [ ] USB storage
- [ ] NTFS/exFAT/FAT32
- [ ] printer discovery
- [ ] scanner discovery
- [ ] external monitor
- [ ] HiDPI scaling
- [ ] suspend/resume
- [ ] battery reporting
- [ ] touchpad
- [ ] touchscreen where present
- [ ] fingerprint reader where present

## Safety

Never overwrite an existing Windows disk during early testing. Use a VM, spare disk or disposable test machine until the installer has passed partitioning tests.
