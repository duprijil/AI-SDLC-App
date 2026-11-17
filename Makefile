SHELL := /bin/bash -o pipefail
.DEFAULT_GOAL := help

-include .env.config

BUILD_PRINT := \e[1;34m
END_BUILD_PRINT := \e[0m
ICON_DONE := [✔]
ICON_ERROR := [x]
ICON_WARNING := [!]
ICON_PROGRESS := [-]

TOOLCHAIN_VERSION := 22.22.1
SRC_PATH := src
INSTALL := npm ci --omit=dev --ignore-scripts
INSTALL_DEV := npm ci
RUN := npx electron-vite
BUILD := npx electron-vite build
FORMAT := npx prettier --write . && npx eslint --fix $(SRC_PATH) electron.vite.config.ts
CHECK_FORMAT := npx prettier --check .
LINT := npx eslint $(SRC_PATH) electron.vite.config.ts
TYPES := npx tsc --noEmit -p tsconfig.json
ARCHITECTURE := npx depcruise $(SRC_PATH) --config .dependency-cruiser.cjs
COMPLEXITY := npx eslint --config eslint.complexity.config.mjs $(SRC_PATH)

define print_progress
	@ echo -e "$(BUILD_PRINT)$(ICON_PROGRESS) $(1)$(END_BUILD_PRINT)"
endef

define print_done
	@ echo -e "$(BUILD_PRINT)$(ICON_DONE) $(1)$(END_BUILD_PRINT)"
endef

define print_warning
	@ echo -e "$(BUILD_PRINT)$(ICON_WARNING) $(1)$(END_BUILD_PRINT)"
endef

.PHONY: help
help:
	@ grep -E '^[a-z][a-z0-9-]*:' Makefile | cut -d: -f1 | sort

.PHONY: install-toolchain
install-toolchain:
	$(call print_progress,Installing toolchain $(TOOLCHAIN_VERSION))
	@ echo "Install Node.js $(TOOLCHAIN_VERSION) from .nvmrc (for example: nvm install) and rerun" >&2 && exit 1
	$(call print_done,Toolchain $(TOOLCHAIN_VERSION) installed)

.PHONY: check-toolchain
check-toolchain:
	@ node --version 2>/dev/null | grep -qx 'v$(TOOLCHAIN_VERSION)' || $(MAKE) install-toolchain

.PHONY: install
install: check-toolchain
	$(call print_progress,Installing project dependencies)
	@ $(INSTALL)
	$(call print_done,Project dependencies installed)

.PHONY: install-dev
install-dev: check-toolchain
	$(call print_progress,Installing project and dev dependencies)
	@ $(INSTALL_DEV)
	$(call print_done,Project and dev dependencies installed)

.PHONY: setup-env
setup-env:
	$(call print_progress,Creating .env.secrets from the example)
	@ cp -n .env.secrets.example .env.secrets || true
	@ chmod 600 .env.secrets
	$(call print_warning,Fill the empty values in .env.secrets)

.PHONY: format
format:
	$(call print_progress,Formatting code)
	@ $(FORMAT)
	$(call print_done,Code formatted)

.PHONY: check-format
check-format:
	$(call print_progress,Checking format)
	@ $(CHECK_FORMAT)
	$(call print_done,Format check passed)

.PHONY: check-lint
check-lint:
	$(call print_progress,Checking lint)
	@ $(LINT)
	$(call print_done,Lint check passed)

.PHONY: check-types
check-types:
	$(call print_progress,Checking types)
	@ $(TYPES)
	$(call print_done,Type check passed)

.PHONY: check-architecture
check-architecture:
	$(call print_progress,Checking architecture)
	@ $(ARCHITECTURE)
	$(call print_done,Architecture check passed)

.PHONY: check-complexity
check-complexity:
	$(call print_progress,Checking complexity)
	@ $(COMPLEXITY)
	$(call print_done,Complexity check passed)

.PHONY: check
check: check-format check-lint check-types check-architecture check-complexity
	$(call print_done,All checks passed)

.PHONY: build
build:
	$(call print_progress,Building the desktop app)
	@ $(BUILD)
	$(call print_done,Desktop app built in out/)

.PHONY: run-desktop
run-desktop:
	$(call print_progress,Starting Ticket Cockpit)
	@ $(RUN) dev
