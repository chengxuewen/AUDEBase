#!/usr/bin/env bash
set -euo pipefail
# Source archive helper — generates audebase-source-YYYYMMDD.tar.gz from git HEAD

timestamp=$(date +%Y%m%d)
output="audebase-source-${timestamp}.tar.gz"
git archive --format=tar.gz -o "$output" HEAD
echo "Source archive: $output"
