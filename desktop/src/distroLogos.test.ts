/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRO_LOGOS, distroLogoId } from "./distroLogos";

test("a WSL distribution name picks its logo, Tux when none is known", () => {
  const cases: [string | undefined, string][] = [
    ["Ubuntu", "ubuntu"],
    ["Ubuntu-24.04", "ubuntu"],
    ["Debian", "debian"],
    ["kali-linux", "kali"],
    ["openSUSE-Tumbleweed", "opensuse"],
    ["openSUSE-Leap-15.6", "opensuse"],
    ["SUSE-Linux-Enterprise-15-SP6", "tux"],
    ["archlinux", "arch"],
    ["FedoraLinux-42", "tux"],
    ["AlmaLinux-9", "tux"],
    ["docker-desktop", "tux"],
    [undefined, "tux"],
  ];
  for (const [name, expected] of cases) assert.equal(distroLogoId(name), expected, String(name));
});

test("every logo is a path on the 24 grid, and Tux follows the text colour", () => {
  for (const logo of Object.values(DISTRO_LOGOS)) assert.match(logo.path, /^M[\d.]/);
  assert.equal(DISTRO_LOGOS.tux.color, null);
});
