#!/usr/bin/env python3
"""Pack AUDEBase runtime for deployment.

Packages the pixi conda environment into a portable archive.
npm node_modules are NOT included (pixi-pack only packs conda envs).
For a full deployment package, a separate node_modules tar.gz must be created
once package.json exists (Phase 1a Week 0+).
"""

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone


def git_short_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return "unknown"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pack AUDEBase pixi runtime environment for deployment",
        epilog="NOTE: node_modules are NOT included. pixi-pack only packs conda environments."
    )
    parser.add_argument(
        "--env", default="runtime",
        choices=["runtime", "dev", "default"],
        help="Pixi environment to pack (default: runtime)"
    )
    parser.add_argument(
        "--output",
        help="Output file path (default: audebase-{env}-{timestamp}-{sha}.tar)"
    )
    parser.add_argument(
        "--skip-build", action="store_true",
        help="Skip the build step before packing"
    )
    parser.add_argument(
        "--clean", action="store_true",
        help="Clean build artifacts after packing"
    )
    args = parser.parse_args()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    sha = git_short_sha()
    output = args.output or f"audebase-{args.env}-{timestamp}-{sha}.tar"

    print("=== AUDEBase Deployment Pack ===")
    print(f"Environment: {args.env}")
    print(f"Output:      {output}")
    print()

    # Step 1: Build
    if args.skip_build:
        print("[1/3] Skipping build (--skip-build)")
    else:
        print("[1/3] Building project...")
        result = subprocess.run(
            ["pixi", "run", "--environment", args.env, "build"],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            stderr_msg = result.stderr.strip()
            if "no task" in stderr_msg.lower() or "not found" in stderr_msg.lower():
                print("[WARN] build task not configured, skipping build step")
            else:
                print(f"[ERROR] Build failed:\n{stderr_msg}", file=sys.stderr)
                sys.exit(1)

    # Step 2: Pack pixi environment
    print(f"[2/3] Packing pixi environment ({args.env})...")
    try:
        subprocess.run(
            ["pixi-pack", "--environment", args.env, "--output-file", output],
            check=True
        )
    except subprocess.CalledProcessError as e:
        msg = e.stderr.strip() if hasattr(e, 'stderr') and e.stderr else str(e)
        print(f"[ERROR] pixi-pack failed: {msg}", file=sys.stderr)
        sys.exit(1)
    except (FileNotFoundError, OSError) as e:
        if isinstance(e, FileNotFoundError):
            print(
                "[ERROR] pixi-pack not found. Install via: pixi global install pixi-pack",
                file=sys.stderr
            )
        else:
            print(f"[ERROR] pixi-pack error: {e}", file=sys.stderr)
        sys.exit(1)

    # Step 3: Summary
    print("[3/3] Done.")
    print()
    try:
        size = os.path.getsize(output)
        print(f"Deployment package created: {output} ({size:_} bytes)")
    except OSError as e:
        print(f"[WARN] Could not read file size: {e}")

    print()
    print("To deploy on target machine:")
    print(f"  pixi run unpack {output} --output ./deploy")
    print()

    print("[INFO] NOTE: node_modules are NOT included in this archive.")
    print("[INFO] pixi-pack only packages conda environments, not npm/pnpm dependencies.")

    # Clean
    if args.clean:
        print("[INFO] Cleaning build artifacts...")
        result = subprocess.run(
            ["pixi", "run", "--environment", args.env, "clean"],
            capture_output=True
        )
        if result.returncode != 0:
            print("[WARN] clean task failed or not configured")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
