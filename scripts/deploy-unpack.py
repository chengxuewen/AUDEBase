#!/usr/bin/env python3
"""Unpack a pixi-pack environment archive on a target machine.

The target machine does NOT need pixi installed — only the pixi-unpack binary.
pixi-unpack is bundled with pixi-pack: `pixi global install pixi-pack`
"""

import argparse
import os
import shutil
import subprocess
import sys


def find_pixi_unpack() -> str:
    """Find pixi-unpack binary: PATH first, then shipped alongside script.

    Returns the binary path, or None if not found.
    """
    # Try PATH
    found = shutil.which("pixi-unpack")
    if found:
        # Verify it's executable
        if os.access(found, os.X_OK):
            return found

    # Try shipped binary
    script_dir = os.path.dirname(os.path.abspath(__file__))
    shipped = os.path.join(script_dir, "bin", "pixi-unpack")
    if os.path.isfile(shipped):
        try:
            if sys.platform != "win32":
                os.chmod(shipped, 0o755)
            if os.access(shipped, os.X_OK) or sys.platform == "win32":
                return shipped
        except OSError:
            pass

    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Unpack a pixi-pack deployment archive on a target machine"
    )
    parser.add_argument(
        "pack_file",
        help="Path to the pixi-pack .tar archive"
    )
    parser.add_argument(
        "--output", default="./deploy",
        help="Directory to unpack into (default: ./deploy)"
    )
    parser.add_argument(
        "--env-name", default="audebase",
        help="Environment directory name (default: audebase)"
    )
    parser.add_argument(
        "--shell", default="bash",
        choices=["bash", "zsh", "fish", "cmd"],
        help="Shell activation script to generate (default: bash)"
    )
    args = parser.parse_args()

    if not os.path.isfile(args.pack_file):
        print(f"[ERROR] Pack file not found: {args.pack_file}", file=sys.stderr)
        sys.exit(1)

    unpack_bin = find_pixi_unpack()
    if unpack_bin is None:
        print("[ERROR] pixi-unpack not found.", file=sys.stderr)
        print(
            "        Install via: pixi global install pixi-pack",
            file=sys.stderr
        )
        script_dir = os.path.dirname(os.path.abspath(__file__))
        print(
            f"        Or place the pixi-unpack binary at: {script_dir}/bin/pixi-unpack",
            file=sys.stderr
        )
        sys.exit(1)

    print("=== AUDEBase Deployment Unpack ===")
    print(f"Pack file:    {args.pack_file}")
    print(f"Output dir:   {args.output}")
    print(f"Env name:     {args.env_name}")
    print()

    # Unpack
    try:
        os.makedirs(args.output, exist_ok=True)
    except OSError as e:
        print(f"[ERROR] Cannot create output directory: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        subprocess.run(
            [
                unpack_bin, args.pack_file,
                "--output-directory", args.output,
                "--env-name", args.env_name,
                "--shell", args.shell,
            ],
            check=True
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError) as e:
        if isinstance(e, subprocess.CalledProcessError):
            msg = e.stderr.strip() if hasattr(e, 'stderr') and e.stderr else str(e)
            print(f"[ERROR] Unpack failed: {msg}", file=sys.stderr)
        elif isinstance(e, FileNotFoundError):
            print(f"[ERROR] pixi-unpack binary not executable: {unpack_bin}", file=sys.stderr)
        else:
            print(f"[ERROR] Unpack error: {e}", file=sys.stderr)
        sys.exit(1)

    env_path = os.path.join(args.output, args.env_name)
    print()
    print("=== Unpack complete ===")
    print(f"Environment at: {env_path}/")
    print()

    # Platform-specific activation instructions
    if sys.platform == "win32":
        activate_bat = os.path.join(args.output, "activate.bat")
        activate_ps1 = os.path.join(args.output, "activate.ps1")
        print("To activate:")
        if os.path.isfile(activate_bat):
            print(f"  {activate_bat}")
        elif os.path.isfile(activate_ps1):
            print(f"  . {activate_ps1}")
        else:
            print(f"  cd {env_path}")
        print()
        print("To run AUDEBase:")
        print(f"  cd {env_path}")
        print("  node --version  # verify Node.js available")
    else:
        # pixi-pack places activate.sh inside the output directory, not env_path
        activate_sh = os.path.join(args.output, "activate.sh")
        print("To activate (bash/zsh):")
        print(f"  source {activate_sh}")
        print()
        print("To run AUDEBase:")
        print(f"  source {activate_sh}")
        print(f"  cd {env_path}")
        print("  node --version  # verify Node.js available")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
