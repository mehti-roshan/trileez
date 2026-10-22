DOTNET ?= $(shell command -v dotnet 2>/dev/null || echo $(HOME)/.dotnet/dotnet)
CONFIGURATION ?= Release
SCRIPT := scripts/linux/dev.sh

.PHONY: restore build-core build test run publish-win check-deps all

restore:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" restore

build-core:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" build-core

build:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" build

test:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" test

run:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" run

publish-win:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" publish-win

check-deps:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" check-deps

all:
	DOTNET="$(DOTNET)" CONFIGURATION="$(CONFIGURATION)" "$(SCRIPT)" all
