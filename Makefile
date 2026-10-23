PLATFORM ?= linux/amd64,linux/arm64
IMAGE ?= all
export PLATFORM IMAGE
.PHONY: build
build:
	node scripts/images/build.mjs
