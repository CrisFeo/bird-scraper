JSCTAGS=node_modules/.bin/jsctags

SRC_JS=$(shell find . -type f -name '*.js' -not -path '*/node_modules/*')

.PHONY: setup
setup:
	. $(NVM_DIR)/nvm.sh && nvm use
	npm install

tags: $(SRC_JS)
	$(JSCTAGS) $(SRC_JS) -f | sed '/^$$/d' | sort > $@
