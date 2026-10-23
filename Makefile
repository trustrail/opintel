PLATFORM ?= linux/amd64,linux/arm64
export PLATFORM
.PHONY: build
build:
	node scripts/images/build.mjs
