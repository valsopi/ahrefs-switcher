.PHONY: test release

test:
	npm test

# Stage and review source explicitly before releasing, as in Compliance Flux.
release:
	@sh scripts/release.sh "$(m)"
